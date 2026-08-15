import { useEffect, useState } from "react";
import { App as AntApp, Form, Input, Modal, Select } from "antd";
import { relationsApi } from "../api";
import { CARDINALITY_OPTIONS } from "../model";
import type { Relation, RelationOptionTable } from "../types";
import { errorMessage } from "../../workspace/model";

interface RelationFormModalProps {
  open: boolean;
  tableId: string;
  editing: Relation | null;
  options: RelationOptionTable[];
  onClose: () => void;
  onSaved: () => void;
}

interface RelationFormValues {
  name: string;
  cardinality: string;
  note: string;
  source_table_id: string;
  source_field_id: string;
  target_table_id: string;
  target_field_id: string;
}

export function RelationFormModal({ open, tableId, editing, options, onClose, onSaved }: RelationFormModalProps) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<RelationFormValues>();
  const [saving, setSaving] = useState(false);
  const sourceTableId = Form.useWatch("source_table_id", form);
  const targetTableId = Form.useWatch("target_table_id", form);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue({
        name: editing.name,
        cardinality: editing.cardinality || "1..n",
        note: editing.note,
        source_table_id: editing.source_table.id,
        source_field_id: editing.source_field.id,
        target_table_id: editing.target_table.id,
        target_field_id: editing.target_field.id,
      });
    } else {
      const source = options.find((item) => item.id === tableId) || options[0];
      const target = options.find((item) => item.id !== source?.id) || options[0];
      form.setFieldsValue({
        name: `FK_${Date.now().toString(36).toUpperCase()}`,
        cardinality: "1..n",
        note: "",
        source_table_id: source?.id,
        source_field_id: source?.fields[0]?.id,
        target_table_id: target?.id,
        target_field_id: target?.fields[0]?.id,
      });
    }
  }, [open, editing, options, tableId, form]);

  const fieldOptions = (tableId?: string) =>
    (options.find((item) => item.id === tableId)?.fields || []).map((field) => ({
      value: field.id,
      label: `${field.code} · ${field.name}`,
    }));

  const save = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) {
        await relationsApi.update(editing.id, {
          name: values.name,
          cardinality: values.cardinality,
          note: values.note || "",
        });
        message.success("关系已更新");
      } else {
        await relationsApi.create({
          name: values.name,
          cardinality: values.cardinality,
          note: values.note || "",
          source_table_id: values.source_table_id,
          source_field_id: values.source_field_id,
          target_table_id: values.target_table_id,
          target_field_id: values.target_field_id,
        });
        message.success(`已新增关系「${values.name}」`);
      }
      onSaved();
      onClose();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) return;
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      width={680}
      centered
      onCancel={onClose}
      className="relation-form-modal"
      title={<span className="relation-form-title">{editing ? "编辑关系" : "新增表关系"}</span>}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      onOk={() => void save()}
    >
      <Form form={form} layout="vertical" className="relation-form">
        <Form.Item label="关系名称" name="name" rules={[{ required: true, message: "请输入关系名称" }]}>
          <Input maxLength={200} placeholder="例如：FK_PEND_TRADE" />
        </Form.Item>
        <div className="relation-form-grid">
          <Form.Item label="源表（引用方）" name="source_table_id" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={options.map((item) => ({ value: item.id, label: `${item.name}（${item.code}）` }))}
              onChange={() => form.setFieldValue("source_field_id", undefined)}
            />
          </Form.Item>
          <Form.Item label="源字段" name="source_field_id" rules={[{ required: true, message: "请选择源字段" }]}>
            <Select showSearch optionFilterProp="label" options={fieldOptions(sourceTableId)} />
          </Form.Item>
          <Form.Item label="目标表（被引用方）" name="target_table_id" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={options.map((item) => ({ value: item.id, label: `${item.name}（${item.code}）` }))}
              onChange={() => form.setFieldValue("target_field_id", undefined)}
            />
          </Form.Item>
          <Form.Item label="目标字段" name="target_field_id" rules={[{ required: true, message: "请选择目标字段" }]}>
            <Select showSearch optionFilterProp="label" options={fieldOptions(targetTableId)} />
          </Form.Item>
          <Form.Item label="基数" name="cardinality">
            <Select options={CARDINALITY_OPTIONS.map((value) => ({ value, label: value }))} />
          </Form.Item>
          <Form.Item label="关系类型">
            <Select value="manual" disabled options={[{ value: "manual", label: "手工维护" }]} />
          </Form.Item>
        </div>
        <Form.Item label="说明" name="note">
          <Input maxLength={1000} placeholder="可选，如：一条委托可分批成交" />
        </Form.Item>
        <p className="relation-form-hint">保存后关系立即出现在相关两张表的「表关系」抽屉与关系图中；同一对「源表.字段 → 目标表.字段」不可重复维护。</p>
      </Form>
    </Modal>
  );
}
