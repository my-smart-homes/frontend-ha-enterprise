import { mdiPlus } from "@mdi/js";
import "@material/mwc-list/mwc-list";
import { css, CSSResultGroup, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { stringCompare } from "../../../common/string/compare";
import "../../../components/ha-card";
import "../../../components/ha-fab";
import "../../../components/ha-svg-icon";
import "../../../components/ha-list-item";
import "../../../components/user/ha-person-badge";
import {
  BuildingPerson,
  createPerson,
  deletePerson,
  fetchPersons,
  Person,
  updatePerson,
} from "../../../data/person";
import { fetchUsers, User } from "../../../data/user";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-loading-screen";
import "../../../layouts/hass-tabs-subpage";
import { HomeAssistant, Route } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";
import "../ha-config-section";
import { configSections } from "../ha-panel-config";
import {
  loadPersonDetailDialog,
  showPersonBuildingManagerDetailDialog,
  showPersonDetailDialog,
  showPersonBuildingDetailDialog,
} from "./show-dialog-person-detail";
import { HA_MANAGER_BASE_URL } from "./constants";

/**
 * Fetch the raw building/users data from the API.
 *
 * Expected response format:
 * {
 *   "success": true,
 *   "data": {
 *     "Bhesh Home": {
 *       "id": 1,
 *       "type": "result",
 *       "success": true,
 *       "result": [ { ... user data ... } ]
 *     },
 *     ...other buildings
 *   }
 * }
 */
export const fetchBuildingUsersRaw = async (): Promise<Record<string, any>> => {
  const response = await fetch(`${HA_MANAGER_BASE_URL}/building/users`);
  const responseJson = await response.json();
  if (responseJson && responseJson.success && responseJson.data) {
    return responseJson.data;
  }
  return {};
};

export const deleteBuildingUser = async (
  buildingId: number,
  userId: string
): Promise<void> => {
  const response = await fetch(
    `${HA_MANAGER_BASE_URL}/building/delete-user/${buildingId}/${userId}`,
    {
      method: "DELETE",
    }
  );
  if (!response.ok) {
    throw new Error("Failed to delete building user");
  }
};

/**
 * (Optional) This helper function flattens the raw building data into a simple array,
 * annotating each user with its building name.
 */
export const flattenBuildingUsers = (
  buildingData: Record<string, any>
): User[] => {
  const flattened: User[] = [];
  Object.entries(buildingData).forEach(([buildingName, data]) => {
    if (data.success && Array.isArray(data.result)) {
      data.result.forEach((user: any) => {
        flattened.push({
          ...user,
          building: buildingName,
          building_id: data.building_id,
        });
      });
    }
  });
  return flattened;
};

@customElement("ha-config-person")
export class HaConfigPerson extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ type: Boolean, attribute: "is-wide" })
  public isWide = false;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _storageItems?: Person[];

  @state() private _configItems?: Person[];

  // This promise will resolve to the combined list of users (local + flattened building users)
  private _usersLoad?: Promise<User[]>;

  /**
   * Holds the raw building data as returned by the API.
   * The keys are building names and each value contains a "result" array.
   */
  @state() private _buildingData: Record<string, any> = {};

  protected render() {
    if (
      !this.hass ||
      this._storageItems === undefined ||
      this._configItems === undefined
    ) {
      return html` <hass-loading-screen></hass-loading-screen> `;
    }
    const hass = this.hass;
    return html`
      <hass-tabs-subpage
        .hass=${hass}
        .narrow=${this.narrow}
        .route=${this.route}
        back-path="/config"
        .tabs=${configSections.persons}
      >
        <ha-config-section .isWide=${this.isWide}>
          <span slot="header">
            ${hass.localize("ui.panel.config.person.caption")}
          </span>
          <span slot="introduction">
            <p>${hass.localize("ui.panel.config.person.introduction")}</p>
            ${this._configItems.length > 0
              ? html`
                  <p>
                    ${hass.localize(
                      "ui.panel.config.person.note_about_persons_configured_in_yaml"
                    )}
                  </p>
                `
              : ""}
            <a
              href=${documentationUrl(hass, "/integrations/person/")}
              target="_blank"
              rel="noreferrer"
            >
              ${hass.localize("ui.panel.config.person.learn_more")}
            </a>
          </span>

          <!-- Storage Persons List -->
          <ha-card outlined class="storage">
            <mwc-list>
              ${this._storageItems.map(
                (entry) => html`
                  <ha-list-item
                    graphic="avatar"
                    @click=${this._openEditEntry}
                    .entry=${entry}
                  >
                    <ha-person-badge
                      .hass=${hass}
                      .person=${entry}
                      slot="graphic"
                    ></ha-person-badge>
                    <span>${entry.name}</span>
                  </ha-list-item>
                `
              )}
            </mwc-list>
            ${this._storageItems.length === 0
              ? html`
                  <div class="empty">
                    ${hass.localize(
                      "ui.panel.config.person.no_persons_created_yet"
                    )}
                    <mwc-button @click=${this._createPerson}>
                      ${hass.localize("ui.panel.config.person.create_person")}
                    </mwc-button>
                  </div>
                `
              : nothing}
          </ha-card>

          <!-- Building Users Section -->
          <ha-card outlined header="All Building Users">
            <mwc-list> ${this._getBuildingUserTemplate()} </mwc-list>
            ${this._hasBuildingUsers() === false
              ? html`
                  <div class="empty">
                    "No Data"
                    <mwc-button @click=${this._createBuildingManager}>
                      ${hass.localize(
                        "ui.panel.config.person.add_building_manager"
                      )}
                    </mwc-button>
                  </div>
                `
              : nothing}
          </ha-card>

          <!-- Configuration.yaml Persons List -->
          ${this._configItems.length > 0
            ? html`
                <ha-card outlined header="Configuration.yaml persons">
                  <mwc-list>
                    ${this._configItems.map(
                      (entry) => html`
                        <ha-list-item graphic="avatar">
                          <ha-person-badge
                            .hass=${hass}
                            .person=${entry}
                            slot="graphic"
                          ></ha-person-badge>
                          <span>${entry.name}</span>
                        </ha-list-item>
                      `
                    )}
                  </mwc-list>
                </ha-card>
              `
            : nothing}
        </ha-config-section>

        <!-- Floating Action Buttons -->
        <ha-fab
          slot="fab"
          .label=${hass.localize("ui.panel.config.person.add_person")}
          extended
          @click=${this._createPerson}
        >
          <ha-svg-icon slot="icon" .path=${mdiPlus}></ha-svg-icon>
        </ha-fab>
        <ha-fab
          slot="fab"
          .label=${hass.localize("ui.panel.config.person.add_building")}
          extended
          @click=${this._createBuilding}
        >
          <ha-svg-icon slot="icon" .path=${mdiPlus}></ha-svg-icon>
        </ha-fab>
        <ha-fab
          slot="fab"
          .label=${hass.localize("ui.panel.config.person.add_building_manager")}
          extended
          @click=${this._createBuildingManager}
        >
          <ha-svg-icon slot="icon" .path=${mdiPlus}></ha-svg-icon>
        </ha-fab>
      </hass-tabs-subpage>
    `;
  }

  protected firstUpdated(changedProps) {
    super.firstUpdated(changedProps);
    this._fetchData();
    loadPersonDetailDialog();
  }

  private async _fetchData() {
    // Fetch local users, raw building data, and persons concurrently.
    const [users, buildingData, personData] = await Promise.all([
      fetchUsers(this.hass!),
      fetchBuildingUsersRaw(),
      fetchPersons(this.hass!),
    ]);

    // Save the raw building data for looping over building names.
    this._buildingData = buildingData;
    // Flatten the building data (annotate each user with its building name)
    const flattenedBuildingUsers = flattenBuildingUsers(buildingData);

    // Combine local users with flattened building users for use in dialogs.
    this._usersLoad = Promise.resolve([...users, ...flattenedBuildingUsers]);

    this._storageItems = personData.storage.sort((ent1, ent2) =>
      stringCompare(ent1.name, ent2.name, this.hass!.locale.language)
    );
    this._configItems = personData.config.sort((ent1, ent2) =>
      stringCompare(ent1.name, ent2.name, this.hass!.locale.language)
    );
    this._openDialogIfPersonSpecifiedInRoute();
  }

  private _openDialogIfPersonSpecifiedInRoute() {
    if (!this.route.path.includes("/edit/")) {
      return;
    }
    const routeSegments = this.route.path.split("/edit/");
    const personId = routeSegments.length > 1 ? routeSegments[1] : null;
    if (!personId) {
      return;
    }
    const personToEdit = this._storageItems!.find((p) => p.id === personId);
    if (personToEdit) {
      this._openDialog(personToEdit);
    } else {
      showAlertDialog(this, {
        title: this.hass?.localize(
          "ui.panel.config.person.person_not_found_title"
        ),
        text: this.hass?.localize("ui.panel.config.person.person_not_found"),
      });
    }
  }

  private _createPerson() {
    this._openDialog();
  }

  private _createBuildingManager() {
    this._openBuildingManagerDialog();
  }

  private _createBuilding() {
    this._openBuildingDialog();
  }

  private _openEditEntry(ev: MouseEvent) {
    const entry: Person = (ev.currentTarget! as any).entry;
    this._openDialog(entry);
  }

  private _allowedUsers(users: User[], currentPerson?: Person) {
    const used = new Set();
    for (const coll of [this._configItems, this._storageItems]) {
      for (const pers of coll!) {
        if (pers.user_id) {
          used.add(pers.user_id);
        }
      }
    }
    const currentUserId = currentPerson ? currentPerson.user_id : undefined;
    return users.filter(
      (user) => user.id === currentUserId || !used.has(user.id)
    );
  }

  private async _openDialog(entry?: BuildingPerson) {
    const users = await this._usersLoad!;
    showPersonDetailDialog(this, {
      entry,
      users: this._allowedUsers(users, entry),
      createEntry: async (values) => {
        const created = await createPerson(this.hass!, values);
        this._storageItems = this._storageItems!.concat(created).sort(
          (ent1, ent2) =>
            stringCompare(ent1.name, ent2.name, this.hass!.locale.language)
        );
      },
      updateEntry: async (values) => {
        const updated = await updatePerson(this.hass!, entry!.id, values);
        this._storageItems = this._storageItems!.map((ent) =>
          ent === entry ? updated : ent
        );
      },
      removeEntry: async () => {
        if (
          !(await showConfirmationDialog(this, {
            title: this.hass!.localize(
              "ui.panel.config.person.confirm_delete_title",
              { name: entry!.name }
            ),
            text: this.hass!.localize(
              "ui.panel.config.person.confirm_delete_text"
            ),
            dismissText: this.hass!.localize("ui.common.cancel"),
            confirmText: this.hass!.localize("ui.common.delete"),
            destructive: true,
          }))
        ) {
          return false;
        }
        try {
          await deletePerson(this.hass!, entry!.id);
          this._storageItems = this._storageItems!.filter(
            (ent) => ent !== entry
          );
          return true;
        } catch (err: any) {
          return false;
        }
      },
      refreshUsers: async () => {
        const [fetchedUsers, buildingData] = await Promise.all([
          fetchUsers(this.hass!),
          fetchBuildingUsersRaw(),
        ]);
        this._buildingData = buildingData;
        const flattened = flattenBuildingUsers(buildingData);
        this._usersLoad = Promise.resolve([...fetchedUsers, ...flattened]);
      },
    });
  }

  private async _openBuildingManagerDialog(entry?: BuildingPerson) {
    const users = await this._usersLoad!;

    // const buildingId = Object.entries(this._buildingData).find(
    //   ([, data]) => data.result.some((user: any) => user.id === entry!.id)
    // )?.[1].id;
    // entry!.building_id = entry!.building_id || 1;
    const buildingId = entry!.building_id;
    showPersonBuildingManagerDetailDialog(this, {
      entry: entry,
      users: users,
      createEntry: async (values) => {
        const created = await createPerson(this.hass!, values);
        this._storageItems = this._storageItems!.concat(created).sort(
          (ent1, ent2) =>
            stringCompare(ent1.name, ent2.name, this.hass!.locale.language)
        );
      },
      updateEntry: async (values) => {
        const updated = await updatePerson(this.hass!, entry!.id, values);
        this._storageItems = this._storageItems!.map((ent) =>
          ent === entry ? updated : ent
        );
      },
      removeEntry: async () => {
        if (
          !(await showConfirmationDialog(this, {
            title: this.hass!.localize(
              "ui.panel.config.person.confirm_delete_title",
              { name: entry!.name }
            ),
            text: this.hass!.localize(
              "ui.panel.config.person.confirm_delete_text"
            ),
            dismissText: this.hass!.localize("ui.common.cancel"),
            confirmText: this.hass!.localize("ui.common.delete"),
            destructive: true,
          }))
        ) {
          return false;
        }
        try {
          await deleteBuildingUser(buildingId!, entry!.id!);
          this._storageItems = this._storageItems!.filter(
            (ent) => ent !== entry
          );
          return true;
        } catch (err: any) {
          return false;
        }
      },
      refreshUsers: async () => {
        const [fetchedUsers, buildingData] = await Promise.all([
          fetchUsers(this.hass!),
          fetchBuildingUsersRaw(),
        ]);
        this._buildingData = buildingData;
        const flattened = flattenBuildingUsers(buildingData);
        this._usersLoad = Promise.resolve([...fetchedUsers, ...flattened]);
      },
    });
  }

  private async _openBuildingDialog(entry?: BuildingPerson) {
    const users = await this._usersLoad!;
    showPersonBuildingDetailDialog(this, {
      entry,
      users: this._allowedUsers(users, entry),
      createEntry: async (values) => {
        const created = await createPerson(this.hass!, values);
        this._storageItems = this._storageItems!.concat(created).sort(
          (ent1, ent2) =>
            stringCompare(ent1.name, ent2.name, this.hass!.locale.language)
        );
      },
      updateEntry: async (values) => {
        const updated = await updatePerson(this.hass!, entry!.id, values);
        this._storageItems = this._storageItems!.map((ent) =>
          ent === entry ? updated : ent
        );
      },
      removeEntry: async () => {
        if (
          !(await showConfirmationDialog(this, {
            title: this.hass!.localize(
              "ui.panel.config.person.confirm_delete_title",
              { name: entry!.name }
            ),
            text: this.hass!.localize(
              "ui.panel.config.person.confirm_delete_text"
            ),
            dismissText: this.hass!.localize("ui.common.cancel"),
            confirmText: this.hass!.localize("ui.common.delete"),
            destructive: true,
          }))
        ) {
          return false;
        }
        try {
          await deletePerson(this.hass!, entry!.id);
          this._storageItems = this._storageItems!.filter(
            (ent) => ent !== entry
          );
          return true;
        } catch (err: any) {
          return false;
        }
      },
      refreshUsers: async () => {
        const [fetchedUsers, buildingData] = await Promise.all([
          fetchUsers(this.hass!),
          fetchBuildingUsersRaw(),
        ]);
        this._buildingData = buildingData;
        const flattened = flattenBuildingUsers(buildingData);
        this._usersLoad = Promise.resolve([...fetchedUsers, ...flattened]);
      },
    });
  }

  /**
   * Renders the Building Users section by looping over the raw building data.
   * For each building, we filter for users whose group_ids include either
   * "system-admin" or "system-users" and then group them by group.
   */
  private _getBuildingUserTemplate() {
    return Object.entries(this._buildingData).map(
      ([buildingName, data], index) => {
        if (!data.success || !Array.isArray(data.result)) {
          return nothing;
        }
        // Filter for users that are either "system-admin" or "system-users"
        const buildingUsers = data.result.filter(
          (user: any) =>
            user.group_ids &&
            Array.isArray(user.group_ids) &&
            (user.group_ids.includes("system-admin") ||
              user.group_ids.includes("system-users"))
        );
        if (buildingUsers.length === 0) {
          return nothing;
        }
        // Group the users by group.
        const groups: Record<string, any[]> = {};
        buildingUsers.forEach((user: any) => {
          if (user.group_ids.includes("system-admin")) {
            groups["system-admin"] = groups["system-admin"] || [];
            groups["system-admin"].push(user);
          }
          if (user.group_ids.includes("system-users")) {
            groups["system-users"] = groups["system-users"] || [];
            groups["system-users"].push(user);
          }
        });
        return html`
          <div class="building-user-group">
            <h2>${index + 1}. ${buildingName}</h2>
            ${Object.entries(groups).map(
              ([group, building_users]) => html`
                <div class="group-section">
                  <h3>${group === "system-admin" ? "Managers" : "Users"}</h3>
                  ${building_users.map(
                    (user: any) => html`
                      <ha-list-item
                        graphic="avatar"
                        @click=${this._handleBuildingUserClick}
                        .entry=${user}
                      >
                        <ha-person-badge
                          .hass=${this.hass}
                          .person=${user}
                          slot="graphic"
                        ></ha-person-badge>
                        <span>${user.name}</span>
                      </ha-list-item>
                    `
                  )}
                </div>
              `
            )}
          </div>
        `;
      }
    );
  }

  /**
   * Returns true if at least one building in the raw data has building users (admin or users).
   */
  private _hasBuildingUsers(): boolean {
    return Object.entries(this._buildingData).some(([_, data]) => {
      if (!data.success || !Array.isArray(data.result)) return false;
      return data.result.some(
        (user: any) =>
          user.group_ids &&
          Array.isArray(user.group_ids) &&
          (user.group_ids.includes("system-admin") ||
            user.group_ids.includes("system-users"))
      );
    });
  }

  /**
   * Handles click events on building user items.
   * Retrieves the `entry` from the event’s currentTarget and opens the building manager dialog.
   */
  private _handleBuildingUserClick(ev: Event) {
    const target = ev.currentTarget as any;
    const user = target.entry;
    this._openBuildingManagerDialog(user);
  }

  static get styles(): CSSResultGroup {
    return css`
      a {
        color: var(--primary-color);
      }
      ha-card {
        max-width: 600px;
        margin: 16px auto;
        overflow: hidden;
      }
      .empty {
        padding: 8px;
        display: flex;
        align-items: center;
        justify-content: space-around;
      }
      .building-user-group h2 {
        margin: 16px;
      }
      .group-section h3 {
        margin: 8px 16px;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-person": HaConfigPerson;
  }
}
