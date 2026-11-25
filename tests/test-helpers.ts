import { admitPatientSchema, medicineCatalogSchema } from "@/lib/validators";

export { admitPatientSchema };

export function createMedicineOrLabSchemaHelper() {
  return medicineCatalogSchema.parse({ name: "Amoxicillin 500mg", price: "45" });
}
