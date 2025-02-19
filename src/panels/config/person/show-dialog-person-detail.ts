import { fireEvent } from "../../../common/dom/fire_event";
import { Person, PersonMutableParams } from "../../../data/person";
import { User } from "../../../data/user";

export interface PersonDetailDialogParams {
  entry?: Person;
  users: User[];
  refreshUsers: () => void;
  createEntry: (values: PersonMutableParams) => Promise<unknown>;
  updateEntry: (updates: Partial<PersonMutableParams>) => Promise<unknown>;
  removeEntry: () => Promise<boolean>;
}

export const loadPersonDetailDialog = () => import("./dialog-person-detail");
export const loadPersonBuildingManagerDialog = () =>
  import("./dialog-building-manager");
export const loadPersonBuildingDetailDialog = () =>
  import("./dialog-building-detail");
export const showPersonDetailDialog = (
  element: HTMLElement,
  systemLogDetailParams: PersonDetailDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-person-detail",
    dialogImport: loadPersonDetailDialog,
    dialogParams: systemLogDetailParams,
  });
};

export const showPersonBuildingManagerDetailDialog = (
  element: HTMLElement,
  systemLogDetailParams: PersonDetailDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-person-building-manager",
    dialogImport: loadPersonBuildingManagerDialog,
    dialogParams: systemLogDetailParams,
  });
};

export const showPersonBuildingDetailDialog = (
  element: HTMLElement,
  systemLogDetailParams: PersonDetailDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-person-building-detail",
    dialogImport: loadPersonBuildingDetailDialog,
    dialogParams: systemLogDetailParams,
  });
};
