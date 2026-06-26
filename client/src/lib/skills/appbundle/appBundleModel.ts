// AppBundle metamodel - the application-center layer. It does not run the app;
// it packages the other skill outputs into one materializable application spec.

export type PageBindingMode = "create" | "edit" | "view" | "approve";

export interface PageWorkflowBinding {
  pageRef: string;
  workflowRef?: string;
  mode: PageBindingMode;
}

export interface AppMenuEntry {
  id: string;
  label: string;
  pageRef: string;
  roleRefs: string[];
}

export interface AppBundleModel {
  id: string;
  name: string;
  description: string;
  entityRefs: string[];
  roleRefs: string[];
  workflowRefs: string[];
  pageRefs: string[];
  pageBindings: PageWorkflowBinding[];
  menuEntries: AppMenuEntry[];
}
