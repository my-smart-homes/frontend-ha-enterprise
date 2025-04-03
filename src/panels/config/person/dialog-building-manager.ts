import { mdiPencil } from "@mdi/js";
import { css, CSSResultGroup, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import "../../../components/entity/ha-entities-picker";
import "../../../components/ha-button";
import { createCloseHeading } from "../../../components/ha-dialog";
import "../../../components/ha-formfield";
import "../../../components/ha-icon-button";
import "../../../components/ha-picture-upload";
import type { HaPictureUpload } from "../../../components/ha-picture-upload";
import "../../../components/ha-settings-row";
import "../../../components/ha-textfield";
import "../../../components/ha-password-field";
import { adminChangeUsername } from "../../../data/auth";
import {
  deleteUser,
  SYSTEM_GROUP_ID_ADMIN,
  SYSTEM_GROUP_ID_USER,
  User,
} from "../../../data/user";
import {
  showAlertDialog,
  showPromptDialog,
} from "../../../dialogs/generic/show-dialog-box";
import { CropOptions } from "../../../dialogs/image-cropper-dialog/show-image-cropper-dialog";
import { haStyleDialog } from "../../../resources/styles";
import { HomeAssistant, ValueChangedEvent } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";
import { showAdminChangePasswordDialog } from "../users/show-dialog-admin-change-password";
import { PersonDetailDialogParams } from "./show-dialog-person-detail";
import { HA_MANAGER_BASE_URL } from "./constants";

const includeDomains = ["device_tracker"];

const cropOptions: CropOptions = {
  round: true,
  quality: 0.75,
  aspectRatio: 1,
};

@customElement("dialog-person-building-manager")
export class DialogPersonBuildingManager extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  // Existing person fields
  @state() private _name = "";

  @state() private _userId?: string;

  @state() private _user?: User;

  @state() private _isAdmin?: boolean;

  @state() private _localOnly?: boolean;

  @state() private _deviceTrackers: string[] = [];

  @state() private _picture: string | null = null;

  @state() private _error?: string;

  @state() private _params?: PersonDetailDialogParams;

  @state() private _submitting = false;

  @state() private _personExists = false;

  // New API fields – inspired by your add‑user dialog
  @state() private _displayName = "";

  @state() private _username = "";

  @state() private _password = "";

  @state() private _confirmPassword = "";

  @state() private _localAccessOnly = false;

  @state() private _administrator = false;

  // New building selection fields
  @state() private _buildingsList: Array<any> = [];

  @state() private _selectedBuildingId: number | null = null;

  private _deviceTrackersAvailable = memoizeOne((hass: HomeAssistant) =>
    Object.keys(hass.states).some(
      (entityId) =>
        entityId.substr(0, entityId.indexOf(".")) === "device_tracker"
    )
  );

  public async showDialog(params: PersonDetailDialogParams): Promise<void> {
    this._params = params;
    this._error = undefined;

    if (this._params.entry) {
      this._personExists = true;
      this._name = this._params.entry.name || "";
      this._displayName = this._params.entry.name || "";
      this._username = this._params.entry.username || "";
      this._userId = this._params.entry.id || undefined;
      this._deviceTrackers = this._params.entry.device_trackers || [];
      this._picture = this._params.entry.picture || null;
      this._user = this._userId
        ? this._params.users.find((user) => user.id === this._userId)
        : undefined;
      this._isAdmin = this._user?.group_ids.includes(SYSTEM_GROUP_ID_ADMIN);
      this._administrator =
        this._params.entry.group_ids?.includes(SYSTEM_GROUP_ID_ADMIN) || false;
      this._localAccessOnly = this._params.entry.local_only || false;
      this._localOnly = this._user?.local_only;
      this._selectedBuildingId = this._params.entry.building_id || null;
    } else {
      this._personExists = false;
      this._name = "";
      this._userId = undefined;
      this._user = undefined;
      this._isAdmin = undefined;
      this._localOnly = undefined;
      this._deviceTrackers = [];
      this._picture = null;

      // Reset new API fields.
      this._displayName = "";
      this._username = "";
      this._password = "";
      this._confirmPassword = "";
      this._localAccessOnly = false;
      this._administrator = false;
    }
    // Fetch the list of buildings from the API
    await this._fetchBuildings();

    await this.updateComplete;
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    const nameInvalid = this._name.trim() === "";
    return html` <ha-dialog
      open
      @closed=${this._close}
      scrimClickAction
      escapeKeyAction
      .heading=${createCloseHeading(
        this.hass,
        this._params.entry
          ? this._params.entry.name
          : this.hass.localize(
              "ui.panel.config.person.detail.new_building_manager"
            )
      )}
    >
      <div>
        ${this._error ? html`<div class="error">${this._error}</div>` : ""}
        <!-- Building Selection Dropdown -->
        <div class="building-selection">
          <label for="building-select">Select Building</label>
          <select
            id="building-select"
            name="selectedBuilding"
            @change=${this._handleBuildingChange}
          >
            ${this._buildingsList.map(
              (building) => html`
                <option
                  value=${building.id}
                  ?selected=${this._selectedBuildingId === building.id}
                >
                  ${building.name}
                </option>
              `
            )}
          </select>
        </div>
        <div class="form">
          <!-- Existing Person Name Field -->
          <ha-textfield
            class="name"
            name="name"
            .value=${this._name}
            @input=${this._handleValueChanged}
            label=${this.hass.localize("ui.panel.config.person.detail.name")}
            required
            .validationMessage=${this.hass.localize("ui.common.error_required")}
            dialogInitialFocus
          ></ha-textfield>

          <ha-picture-upload
            .hass=${this.hass}
            .value=${this._picture}
            crop
            .cropOptions=${cropOptions}
            @change=${this._pictureChanged}
          ></ha-picture-upload>

          <!-- New API Fields (User credentials) -->
          <ha-textfield
            class="display-name"
            name="displayName"
            .value=${this._displayName}
            @input=${this._handleValueChanged}
            label="Display Name"
            required
            .validationMessage=${this.hass.localize("ui.common.error_required")}
          ></ha-textfield>
          <ha-textfield
            class="username"
            name="username"
            .value=${this._username}
            @input=${this._handleValueChanged}
            label="Username"
            required
            .validationMessage=${this.hass.localize("ui.common.error_required")}
          ></ha-textfield>
          <ha-password-field
            class="password"
            name="password"
            .value=${this._password}
            @input=${this._handleValueChanged}
            label="Password"
            required
            .validationMessage=${this.hass.localize("ui.common.error_required")}
          ></ha-password-field>
          <ha-password-field
            class="confirm-password"
            name="confirmPassword"
            .value=${this._confirmPassword}
            @input=${this._handleValueChanged}
            label="Confirm Password"
            required
            .invalid=${this._password !== "" &&
            this._confirmPassword !== "" &&
            this._confirmPassword !== this._password}
            .errorMessage=${this.hass.localize(
              "ui.panel.config.users.add_user.password_not_match"
            )}
          ></ha-password-field>

          <!-- Local Access Only & Administrator Switches -->
          <ha-settings-row>
            <span slot="heading">
              ${this.hass.localize(
                "ui.panel.config.person.detail.local_access_only"
              )}
            </span>
            <span slot="description">
              ${this.hass.localize(
                "ui.panel.config.person.detail.local_access_only_description"
              )}
            </span>
            <ha-switch
              .checked=${this._localAccessOnly}
              @change=${this._localAccessOnlyChanged}
            ></ha-switch>
          </ha-settings-row>
          <ha-settings-row>
            <span slot="heading">
              ${this.hass.localize("ui.panel.config.person.detail.admin")}
            </span>
            <span slot="description">
              ${this.hass.localize(
                "ui.panel.config.person.detail.admin_description"
              )}
            </span>
            <ha-switch
              .checked=${this._administrator}
              @change=${this._administratorChanged}
            ></ha-switch>
          </ha-settings-row>

          <!-- (Optional) Render extra user fields if a Home Assistant user exists -->
          ${this._renderUserFields()}
          ${this._deviceTrackersAvailable(this.hass)
            ? html`
                <p>
                  ${this.hass.localize(
                    "ui.panel.config.person.detail.device_tracker_intro"
                  )}
                </p>
                <ha-entities-picker
                  .hass=${this.hass}
                  .value=${this._deviceTrackers}
                  .includeDomains=${includeDomains}
                  .pickedEntityLabel=${this.hass.localize(
                    "ui.panel.config.person.detail.device_tracker_picked"
                  )}
                  .pickEntityLabel=${this.hass.localize(
                    "ui.panel.config.person.detail.device_tracker_pick"
                  )}
                  @value-changed=${this._deviceTrackersChanged}
                ></ha-entities-picker>
              `
            : html`
                <p>
                  ${this.hass.localize(
                    "ui.panel.config.person.detail.no_device_tracker_available_intro"
                  )}
                </p>
                <ul>
                  <li>
                    <a
                      href=${documentationUrl(
                        this.hass,
                        "/integrations/#presence-detection"
                      )}
                      target="_blank"
                      rel="noreferrer"
                      >${this.hass.localize(
                        "ui.panel.config.person.detail.link_presence_detection_integrations"
                      )}</a
                    >
                  </li>
                  <li>
                    <a @click=${this._close} href="/config/integrations">
                      ${this.hass.localize(
                        "ui.panel.config.person.detail.link_integrations_page"
                      )}
                    </a>
                  </li>
                </ul>
              `}
        </div>
      </div>
      ${this._params.entry
        ? html`
            <ha-button
              slot="secondaryAction"
              class="warning"
              @click=${this._deleteEntry}
              .disabled=${(this._user && this._user.is_owner) ||
              this._submitting}
            >
              ${this.hass.localize("ui.panel.config.person.detail.delete")}
            </ha-button>
          `
        : nothing}
      ${this._params.entry
        ? html` <ha-button
            slot="primaryAction"
            @click=${this._updateEntry}
            .disabled=${nameInvalid || this._submitting}
          >
            ${this.hass.localize("ui.panel.config.person.detail.update")}
          </ha-button>`
        : html` <ha-button
            slot="primaryAction"
            @click=${this._createEntry}
            .disabled=${nameInvalid || this._submitting}
          >
            ${this.hass.localize("ui.panel.config.person.detail.create")}
          </ha-button>`}
    </ha-dialog>`;
  }

  private _handleValueChanged(ev: ValueChangedEvent<string>): void {
    this._error = undefined;
    const target = ev.target as HTMLInputElement;
    switch (target.name) {
      case "name":
        this._name = target.value;
        break;
      case "displayName":
        this._displayName = target.value;
        break;
      case "username":
        this._username = target.value;
        break;
      case "password":
        this._password = target.value;
        break;
      case "confirmPassword":
        this._confirmPassword = target.value;
        break;
      default:
        break;
    }
  }

  private _handleBuildingChange(ev: Event): void {
    const target = ev.target as HTMLSelectElement;
    this._selectedBuildingId = Number(target.value);
  }

  private _localAccessOnlyChanged(ev: Event): void {
    const target = ev.target as HTMLInputElement;
    this._localAccessOnly = target.checked;
  }

  private _administratorChanged(ev: Event): void {
    const target = ev.target as HTMLInputElement;
    this._administrator = target.checked;
  }

  private _deviceTrackersChanged(ev: ValueChangedEvent<string[]>): void {
    this._error = undefined;
    this._deviceTrackers = ev.detail.value;
  }

  private _pictureChanged(ev: ValueChangedEvent<string | null>): void {
    this._error = undefined;
    this._picture = (ev.target as HaPictureUpload).value;
  }

  private async _fetchBuildings() {
    try {
      const response = await fetch(`${HA_MANAGER_BASE_URL}/building/list`);
      const result = await response.json();
      if (result.success) {
        this._buildingsList = result.data;
        // Set a default selection if none is already set
        if (this._buildingsList.length > 0 && !this._selectedBuildingId) {
          this._selectedBuildingId = this._buildingsList[0].id;
        }
      } else {
        this._error = "Failed to load buildings";
      }
    } catch (err: any) {
      this._error = err.message || "Unknown error while loading buildings";
    }
  }

  private async _createEntry() {
    // Validate that the two password fields match.
    if (this._password !== this._confirmPassword) {
      this._error = this.hass.localize(
        "ui.panel.config.users.add_user.password_not_match"
      );
      return;
    }

    const formData = new FormData();

    // Add the image file if it exists
    if (this._picture) {
      try {
        // Convert base64 to blob
        const response = await fetch(this._picture);
        const blob = await response.blob();
        formData.append("profile_picture", blob, "profile.jpg");
      } catch (err) {
        showAlertDialog(this, {
          title: `Error processing image: ${err}`,
        });
      }
    }

    // Add other form data
    formData.append("display_name", this._displayName);
    formData.append("username", this._username);
    formData.append("password", this._password);
    formData.append("confirm_password", this._confirmPassword);
    if (this._selectedBuildingId !== null) {
      formData.append("building_id", this._selectedBuildingId.toString());
    }
    formData.append("local_access_only", this._localAccessOnly.toString());
    formData.append("administrator", this._administrator.toString());

    try {
      if (this._selectedBuildingId === null) {
        throw new Error("Building ID is required");
      }
      const response = await fetch(
        `${HA_MANAGER_BASE_URL}/building/create-user/${this._selectedBuildingId}`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage =
          errorData.errors?.[0]?.message ||
          `Failed to create user. Status: ${response.status} - ${response.statusText}`;
        showAlertDialog(this, {
          title: errorMessage,
        });
      } else {
        this._params?.refreshUsers();
        showAlertDialog(this, {
          title: "User created successfully",
        });
        this._close();
      }
    } catch (err: any) {
      this._error = err.message || "Unknown error";
      showAlertDialog(this, {
        title: `Error Creating User ${err.message}`,
      });
    }
  }

  private async _updateEntry() {
    // Validate that the two password fields match.
    if (this._password !== this._confirmPassword) {
      this._error = this.hass.localize(
        "ui.panel.config.users.add_user.password_not_match"
      );
      return;
    }

    const payload = {
      user_id: this._userId,
      display_name: this._displayName,
      username: this._username,
      password: this._password,
      confirm_password: this._confirmPassword,
      building_id: this._selectedBuildingId,
      local_access_only: this._localAccessOnly,
      administrator: this._administrator,
      group_ids: this._administrator
        ? [SYSTEM_GROUP_ID_ADMIN]
        : [SYSTEM_GROUP_ID_USER],
    };

    try {
      const response = await fetch(
        `${HA_MANAGER_BASE_URL}/building/edit-user/${this._selectedBuildingId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage =
          errorData.errors?.[0]?.message ||
          `Failed to update user. Status: ${response.status} - ${response.statusText}`;
        showAlertDialog(this, {
          title: errorMessage,
        });
      } else {
        this._params?.refreshUsers();
        showAlertDialog(this, {
          title: "User updated successfully",
        });
        this._close();
      }
    } catch (err: any) {
      this._error = err.message || "Unknown error";
      showAlertDialog(this, {
        title: `Error Updating User ${err.message}`,
      });
    }
  }

  private _renderUserFields() {
    const user = this._user;
    if (!user) return nothing;
    return html`
      ${!user.system_generated
        ? html`
            <ha-settings-row>
              <span slot="heading">
                ${this.hass.localize("ui.panel.config.person.detail.username")}
              </span>
              <span slot="description">${user.username}</span>
              ${this.hass.user?.is_owner
                ? html`
                    <ha-icon-button
                      .path=${mdiPencil}
                      @click=${this._changeUsername}
                      .label=${this.hass.localize(
                        "ui.panel.config.person.detail.change_username"
                      )}
                    ></ha-icon-button>
                  `
                : nothing}
            </ha-settings-row>
          `
        : nothing}
      ${!user.system_generated && this.hass.user?.is_owner
        ? html`
            <ha-settings-row>
              <span slot="heading">
                ${this.hass.localize("ui.panel.config.person.detail.password")}
              </span>
              <span slot="description">************</span>
              ${this.hass.user?.is_owner
                ? html`
                    <ha-icon-button
                      .path=${mdiPencil}
                      @click=${this._changePassword}
                      .label=${this.hass.localize(
                        "ui.panel.config.person.detail.change_password"
                      )}
                    ></ha-icon-button>
                  `
                : nothing}
            </ha-settings-row>
          `
        : nothing}
      <ha-settings-row>
        <span slot="heading">
          ${this.hass.localize(
            "ui.panel.config.person.detail.local_access_only"
          )}
        </span>
        <span slot="description">
          ${this.hass.localize(
            "ui.panel.config.person.detail.local_access_only_description"
          )}
        </span>
        <ha-switch
          .disabled=${user.system_generated}
          .checked=${this._localOnly}
          @change=${this._localAccessOnlyChanged}
        ></ha-switch>
      </ha-settings-row>
      <ha-settings-row>
        <span slot="heading">
          ${this.hass.localize("ui.panel.config.person.detail.admin")}
        </span>
        <span slot="description">
          ${this.hass.localize(
            "ui.panel.config.person.detail.admin_description"
          )}
        </span>
        <ha-switch
          .disabled=${user.system_generated || user.is_owner}
          .checked=${this._administrator}
          @change=${this._adminChanged}
        ></ha-switch>
      </ha-settings-row>
    `;
  }

  private async _changePassword() {
    if (!this._user) {
      return;
    }
    const credential = this._user.credentials.find(
      (cred) => cred.type === "homeassistant"
    );
    if (!credential) {
      showAlertDialog(this, {
        title: "No Home Assistant credentials found.",
      });
      return;
    }
    showAdminChangePasswordDialog(this, { userId: this._user.id });
  }

  private async _changeUsername() {
    if (!this._user) {
      return;
    }
    const credential = this._user.credentials.find(
      (cred) => cred.type === "homeassistant"
    );
    if (!credential) {
      showAlertDialog(this, {
        title: "No Home Assistant credentials found.",
      });
      return;
    }
    const newUsername = await showPromptDialog(this, {
      inputLabel: this.hass.localize(
        "ui.panel.config.users.change_username.new_username"
      ),
      confirmText: this.hass.localize(
        "ui.panel.config.users.change_username.change"
      ),
      title: this.hass.localize(
        "ui.panel.config.users.change_username.caption"
      ),
      defaultValue: this._user.username!,
    });
    if (newUsername) {
      try {
        await adminChangeUsername(this.hass, this._user.id, newUsername);
        this._params?.refreshUsers();
        this._user = { ...this._user, username: newUsername };
        showAlertDialog(this, {
          text: this.hass.localize(
            "ui.panel.config.users.change_username.username_changed"
          ),
        });
      } catch (err: any) {
        showAlertDialog(this, {
          title: this.hass.localize(
            "ui.panel.config.users.change_username.failed"
          ),
          text: err.message,
        });
      }
    }
  }

  private async _deleteEntry() {
    this._submitting = true;
    try {
      if (await this._params!.removeEntry()) {
        if (this._params!.entry!.user_id) {
          deleteUser(this.hass, this._params!.entry!.user_id);
        }
        this._params = undefined;
      }
    } finally {
      this._submitting = false;
    }
  }

  private _adminChanged(ev: Event): void {
    const target = ev.target as HTMLInputElement;
    this._isAdmin = target.checked;
  }

  private _close(): void {
    // If we created a user ID but the person was not saved, remove it.
    if (!this._personExists && this._userId) {
      deleteUser(this.hass, this._userId);
      this._params?.refreshUsers();
      this._userId = undefined;
    }
    this._params = undefined;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      css`
        ha-picture-upload,
        ha-textfield,
        ha-password-field {
          display: block;
          margin-bottom: 16px;
        }
        ha-picture-upload {
          --file-upload-image-border-radius: 50%;
        }
        ha-settings-row {
          padding: 0;
        }
        a {
          color: var(--primary-color);
        }
        .error {
          color: var(--error-color);
          margin-bottom: 16px;
        }
        .building-selection {
          margin-bottom: 16px;
        }
        .building-selection label {
          display: block;
          margin-bottom: 4px;
        }
        .building-selection select {
          width: 100%;
          padding: 8px;
          font-size: 14px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-person-building-manager": DialogPersonBuildingManager;
  }
}
