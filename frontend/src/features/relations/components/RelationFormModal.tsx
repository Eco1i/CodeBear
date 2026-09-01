import { useEffect, useState } from "react";
import { App as AntApp, Form, Input, Modal, Select } from "antd";
import { useI18n } from "../../preferences/PreferencesProvider";
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
  source_type: "auto" | "manual";
  note: string;
  source_table_id: string;
  source_field_id: string;
  target_table_id: string;
  target_field_id: string;
}

export function RelationFormModal({
  open,
  tableId,
  editing,
  options,
  onClose,
  onSaved,
}: RelationFormModalProps) {
  const { message } = AntApp.useApp();
  const { t } = useI18n();
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
        source_type: editing.source_type,
        note: editing.note,
        source_table_id: editing.source_table.id,
        source_field_id: editing.source_field.id,
        target_table_id: editing.target_table.id,
        target_field_id: editing.target_field.id,
      });
    } else {
      const source = options.find((item) => item.id === tableId) || options[0];
      const target =
        options.find((item) => item.id !== source?.id) || options[0];
      form.setFieldsValue({
        name: `FK_${Date.now().toString(36).toUpperCase()}`,
        cardinality: "1..n",
        source_type: "manual",
        note: "",
        source_table_id: source?.id,
        source_field_id: source?.fields[0]?.id,
        target_table_id: target?.id,
        target_field_id: target?.fields[0]?.id,
      });
    }
  }, [open, editing, options, tableId, form]);

  const fieldOptions = (tableId?: string) =>
    (options.find((item) => item.id === tableId)?.fields || []).map(
      (field) => ({
        value: field.id,
        label: `${field.code} · ${field.name}`,
      }),
    );

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
        message.success(t("relation.updated"));
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
        message.success(t("relation.created", { name: values.name }));
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
      width={720}
      centered
      onCancel={onClose}
      className="relation-form-modal"
      title={
        <span className="relation-form-title-copy">
          <span className="relation-form-title">
            {editing ? t("relation.editTitle") : t("relation.addTitle")}
          </span>
          <small>{t("relation.formSubtitle")}</small>
        </span>
      }
      okText={t("relation.save")}
      cancelText={t("common.cancel")}
      confirmLoading={saving}
      onOk={() => void save()}
    >
      <Form form={form} layout="vertical" className="relation-form">
        <div className="relation-form-grid">
          <Form.Item
            className="relation-form-full"
            label={t("relation.name")}
            name="name"
            rules={[{ required: true, message: t("relation.nameRequired") }]}
          >
            <Input
              maxLength={200}
              placeholder={t("relation.namePlaceholder")}
            />
          </Form.Item>
          <Form.Item
            label={t("relation.sourceTable")}
            name="source_table_id"
            rules={[{ required: true }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={options.map((item) => ({
                value: item.id,
                label: `${item.name}（${item.code}）`,
              }))}
              onChange={() => form.setFieldValue("source_field_id", undefined)}
            />
          </Form.Item>
          <Form.Item
            label={t("relation.sourceField")}
            name="source_field_id"
            rules={[
              { required: true, message: t("relation.sourceFieldRequired") },
            ]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={fieldOptions(sourceTableId)}
            />
          </Form.Item>
          <Form.Item
            label={t("relation.targetTable")}
            name="target_table_id"
            rules={[{ required: true }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={options.map((item) => ({
                value: item.id,
                label: `${item.name}（${item.code}）`,
              }))}
              onChange={() => form.setFieldValue("target_field_id", undefined)}
            />
          </Form.Item>
          <Form.Item
            label={t("relation.targetField")}
            name="target_field_id"
            rules={[
              { required: true, message: t("relation.targetFieldRequired") },
            ]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={fieldOptions(targetTableId)}
            />
          </Form.Item>
          <Form.Item label={t("relation.cardinality")} name="cardinality">
            <Select
              options={CARDINALITY_OPTIONS.map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
          <Form.Item label={t("relation.type")} name="source_type">
            <Select
              disabled
              options={[{ value: "manual", label: t("relation.manual") }]}
            />
          </Form.Item>
          <Form.Item
            className="relation-form-full"
            label={t("relation.note")}
            name="note"
          >
            <Input
              maxLength={1000}
              placeholder={t("relation.notePlaceholder")}
            />
          </Form.Item>
        </div>
        <p className="relation-form-hint">{t("relation.formHint")}</p>
      </Form>
    </Modal>
  );
}
