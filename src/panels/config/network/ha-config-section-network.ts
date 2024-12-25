import { css, html, LitElement, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../../layouts/hass-subpage";
import type { HomeAssistant, Route } from "../../../types";
import "./ha-config-network";
import "./ha-config-url-form";
import "./supervisor-hostname";
import "./supervisor-network";
import "../../../components/ha-circular-progress";

@customElement("ha-config-section-network")
class HaConfigSectionNetwork extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public route!: Route;

  @property({ type: Boolean }) public narrow = false;

  @state() private hassNotLoaded = true;

  @state() private _isLoading = true;

  @state() private _error = "Error";

  @state() private remoteUrl = "";

  protected updated(
    changedProps: Map<string | number | symbol, unknown>
  ): void {
    super.updated(changedProps);
    if (changedProps.has("hass") && this.hass && this.hassNotLoaded) {
      this.hassNotLoaded = false;
      this._onLoad();
    }
  }

  private async _onLoad(): Promise<void> {
    try {
      this._isLoading = true;
      const response = await this.hass.callWS<number>({
        type: "config_entries/get_remote_external_url",
      });

      if (!response) throw new Error("No response from server");
      if (!response.external_url) throw new Error("No external url found");
      this.remoteUrl = response.external_url;
    } catch (error) {
      this._error = "Failed to load remote URL.";
    }
    this._isLoading = false;
  }

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        back-path="/config/system"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.hass.localize("ui.panel.config.network.caption")}
      >
        <div class="content">
          <ha-card
            class="no-padding"
            outlined
            .header=${this.hass.localize(
              "ui.panel.config.network.supervisor.hostname.title"
            )}
          >
            <div class="card-content">
              ${this._isLoading
                ? html`<ha-circular-progress indeterminate size="small">
                  </ha-circular-progress>`
                : html` <h3>Remote Url:</h3>
                    <p>
                      ${html`<a
                        title="remote-url"
                        target="_blank"
                        href="https://${this.remoteUrl}"
                        >${this.remoteUrl}</a
                      >`}
                    </p>`}
            </div>
            <div class="card-actions">
              <mwc-button .disabled=${true}>
                ${this.hass.localize("ui.common.save")}
              </mwc-button>
            </div>
          </ha-card>
        </div>
      </hass-subpage>
    `;
  }

  static styles = css`
    .content {
      padding: 28px 20px 0;
      max-width: 1040px;
      margin: 0 auto;
    }
    supervisor-hostname,
    supervisor-network,
    ha-config-url-form,
    ha-config-network {
      display: block;
      margin: 0 auto;
      margin-bottom: 24px;
      max-width: 600px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-section-network": HaConfigSectionNetwork;
  }
}
