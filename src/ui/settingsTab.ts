import { PluginSettingTab, Setting, type App } from "obsidian";
import type ObsictionaryPlugin from "../main";
import {
  BUILTIN_PRESETS,
  sanitizePropertyKeys,
  SORT_LABELS,
  type DefaultView,
  type PresetId,
  type SortMode,
} from "../settings";

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
      .setName("Default view")
      .setDesc("How dictionary notes open: the interactive view, or plain markdown.")
      .addDropdown((dropdown) => {
        dropdown.addOption("dictionary", "Interactive dictionary");
        dropdown.addOption("markdown", "Markdown source");
        dropdown.setValue(this.plugin.settings.defaultView);
        dropdown.onChange((value) => {
          this.plugin.settings.defaultView = value as DefaultView;
          void this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Default word order")
      .setDesc("How words are sorted when a dictionary opens.")
      .addDropdown((dropdown) => {
        for (const [mode, label] of Object.entries(SORT_LABELS)) {
          dropdown.addOption(mode, label);
        }
        dropdown.setValue(this.plugin.settings.defaultSort);
        dropdown.onChange((value) => {
          this.plugin.settings.defaultSort = value as SortMode;
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
      .setName("Displayed properties")
      .setDesc(
        "Frontmatter keys shown in the dictionary header, one per line (or " +
          "comma-separated), in this order. Leave empty to show every property. " +
          "System keys (obsictionary, preset, related, tags, up/prev/next/source, " +
          "srs, due, …) are ignored.",
      )
      .addTextArea((text) => {
        text.inputEl.rows = 4;
        text.setPlaceholder("level\nsource");
        text.setValue(this.plugin.settings.properties.join("\n"));
        const commit = (): void => {
          const keys = sanitizePropertyKeys(text.getValue());
          this.plugin.settings.properties = keys;
          text.setValue(keys.join("\n"));
          void this.plugin.saveSettings();
          this.plugin.refreshDictionaryViews();
        };
        text.inputEl.addEventListener("blur", commit);
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
