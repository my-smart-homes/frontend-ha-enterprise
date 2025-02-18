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
import { PersonMutableParams } from "../../../data/person";
import {
  deleteUser,
  SYSTEM_GROUP_ID_ADMIN,
  User,
} from "../../../data/user";
import {
  showAlertDialog,
} from "../../../dialogs/generic/show-dialog-box";
import { haStyleDialog } from "../../../resources/styles";
import { HomeAssistant, ValueChangedEvent } from "../../../types";
import { PersonDetailDialogParams } from "./show-dialog-person-detail";
import {HA_MANAGER_BASE_URL} from "./constants"


@customElement("dialog-person-building-detail")
export class DialogPersonBuildingDetail extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  // Existing person fields
  @state() private _name = "";
  @state() private _userId?: string;
  @state() private _user?: User;
  @state() private _error?: string;
  @state() private _params?: PersonDetailDialogParams;
  @state() private _submitting = false;
  @state() private _personExists = false;

  // New API fields – inspired by your add‑user dialog
  @state() private _buildingUrl = "";
  @state() private _accessToken = "";


  public async showDialog(params: PersonDetailDialogParams): Promise<void> {
    this._params = params;
    this._error = undefined;

    if (this._params.entry) {
      this._personExists = true;
      this._name = this._params.entry.name || "";
      this._userId = this._params.entry.user_id || undefined;
      this._user = this._userId
        ? this._params.users.find((user) => user.id === this._userId)
        : undefined;
    } else {
      this._personExists = false;
      this._name = "";
      this._userId = undefined;
      this._user = undefined;
    }
    // Reset new API fields.
    this._buildingUrl = "";
    this._accessToken = "";

    await this.updateComplete;
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    const nameInvalid = this._name.trim() === "";
    return html`
      <ha-dialog
        open
        @closed=${this._close}
        scrimClickAction
        escapeKeyAction
        .heading=${createCloseHeading(
          this.hass,
          this._params.entry
            ? this._params.entry.name
            : this.hass.localize(
                "ui.panel.config.person.detail.name"
              )
        )}
      >
        <div>
          ${this._error ? html`<div class="error">${this._error}</div>` : ""}
          <div class="form">
            <!-- Existing Building Name Field -->
            <ha-textfield
              class="name"
              name="name"
              .value=${this._name}
              @input=${this._handleValueChanged}
              label=${this.hass.localize("ui.panel.config.building.name")}
              required
              .validationMessage=${this.hass.localize(
                "ui.common.error_required"
              )}
              dialogInitialFocus
            ></ha-textfield>
      
            <!-- New API Fields (User credentials) -->
            <ha-textfield
              class="display-name"
              name="buildingUrl"
              .value=${this._buildingUrl}
              @input=${this._handleValueChanged}
              label=${this.hass.localize("ui.panel.config.building.url")}
              required
              .validationMessage=${this.hass.localize(
                "ui.common.error_required"
              )}
            ></ha-textfield>
              <ha-textfield
              class="display-name"
              name="accessToken"
              .value=${this._accessToken}
              @input=${this._handleValueChanged}
              label="Access Token"
              required
              .validationMessage=${this.hass.localize(
                "ui.common.error_required"
              )}
            ></ha-textfield>
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
          
        <ha-button
          slot="primaryAction"
          @click=${this._createOrUpdateEntry}
          .disabled=${nameInvalid || this._submitting}
        >
          ${this._params.entry
            ? this.hass.localize("ui.panel.config.person.detail.update")
            : this.hass.localize("ui.panel.config.person.detail.create")}
        </ha-button>
      </ha-dialog>
    `;
  }

  private _handleValueChanged(ev: ValueChangedEvent<string>): void {
    this._error = undefined;
    const target = ev.target as HTMLInputElement;
    switch (target.name) {
      case "name":
        this._name = target.value;
        break;
      case "buildingUrl":
        this._buildingUrl = target.value;
        break;
      case "accessToken":
        this._accessToken = target.value;
        break;
      default:
        break;
    }
  }

  private async _createOrUpdateEntry() {
    // Validate that the two password fields match.

    const payload = {
      name: this._name,
      building_url: this._buildingUrl,
      access_token: this._accessToken
    };

    try {
      const response = await fetch(
        `${HA_MANAGER_BASE_URL}/building/register`,
        {
          method: "POST",
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
          `Failed to register building. Status: ${response.status} - ${response.statusText}`;
        showAlertDialog(this, {
          title: errorMessage,
        });
      } else {
        showAlertDialog(this, {
          title: 'Building created successfully',
        });
        // this._params?.refreshUsers();
        this._close();
      }
    } catch (err: any) {
      this._error = err.message || "Unknown error";
      showAlertDialog(this, {
        title: `Error Creating User ${err.message}`,
      });
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
    "dialog-person-building-detail": DialogPersonBuildingDetail;
  }
}
