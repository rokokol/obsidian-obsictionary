import { PluginSettingTab, Setting, type App } from "obsidian";
import type ObsictionaryPlugin from "../main";
import { BUILTIN_PRESETS, type PresetId } from "../settings";

export class ObsictionarySettingTab extends PluginSettingTab {
  private readonly plugin: ObsictionaryPlugin;

  constructor(app: App, plugin: ObsictionaryPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Default preset")
      .setDesc("Preset applied to newly created dictionaries.")
      .addDropdown((dropdown) => {
        for (const [id, def] of Object.entries(BUILTIN_PRESETS)) {
          dropdown.addOption(id, def.label);
        }
        dropdown.setValue(this.plugin.settings.defaultPreset);
        dropdown.onChange((value) => {
          this.plugin.settings.defaultPreset = value as PresetId;
          void this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Target retention")
      .setDesc("Desired probability of recall for FSRS scheduling (0.7–0.97).")
      .addSlider((slider) => {
        slider
          .setLimits(0.7, 0.97, 0.01)
          .setValue(this.plugin.settings.fsrsRetention)
          .onChange((value) => {
            this.plugin.settings.fsrsRetention = value;
            void this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Review scope")
      .setDesc("Pull due cards from the active dictionary only, or from the whole vault.")
      .addDropdown((dropdown) => {
        dropdown.addOption("note", "Active note");
        dropdown.addOption("vault", "Whole vault");
        dropdown.setValue(this.plugin.settings.reviewScope);
        dropdown.onChange((value) => {
          this.plugin.settings.reviewScope = value === "vault" ? "vault" : "note";
          void this.plugin.saveSettings();
        });
      });
  }
}
