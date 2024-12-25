import type { HomeAssistant } from "../../types";

export async function fetchDeviceCountLimit(
  hass: HomeAssistant
): Promise<number | undefined> {
  try {
    const response = await hass.callWS<number>({
      type: "config_entries/get_device_limit",
    });
    return response.device_count_limit;
  } catch (error) {
    return undefined;
  }
}
