import { PluginSettingTab, Setting, type App } from "obsidian";
import type ObsictionaryPlugin from "../main";
import {
  sanitizeColumns,
  sanitizePropertyKeys,
  SORT_LABELS,
  type DefaultView,
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
      .setName("New dictionary columns")
      .setDesc(
        "Comma-separated columns a new dictionary is created with. The first is " +
          "the card front (the word/key); the rest are its fields. Any number of " +
          "columns is fine.",
      )
      .addText((text) => {
        text.setPlaceholder("word, transcription, translation");
        text.setValue(this.plugin.settings.newDictionaryColumns.join(", "));
        const commit = (): void => {
          const columns = sanitizeColumns(text.getValue());
          if (columns.length > 0) this.plugin.settings.newDictionaryColumns = columns;
          text.setValue(this.plugin.settings.newDictionaryColumns.join(", "));
          void this.plugin.saveSettings();
        };
        text.inputEl.addEventListener("blur", commit);
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
        "Frontmatter keys shown in the dictionary header, comma-separated, in this " +
          "order. Wikilink/URL values render as links. Leave empty (the default) to " +
          "show every property.",
      )
      .addText((text) => {
        text.setPlaceholder("up, source, related, level");
        text.setValue(this.plugin.settings.properties.join(", "));
        const commit = (): void => {
          const keys = sanitizePropertyKeys(text.getValue());
          this.plugin.settings.properties = keys;
          text.setValue(keys.join(", "));
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

    this.renderReminders(containerEl);
  }

  private renderReminders(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Reminders").setHeading();

    const { settings } = this.plugin;
    // The switches below only mean anything while the master one is on, so they
    // are built once and hidden in place rather than redrawing the whole tab.
    const dependent: HTMLElement[] = [];
    const syncDependent = (): void => {
      for (const el of dependent) el.toggle(settings.remindersEnabled);
    };

    new Setting(containerEl)
      .setName("Remind me about due cards")
      .setDesc("Turn off to silence every reminder. Individual dictionaries can be muted too.")
      .addToggle((toggle) => {
        toggle.setValue(settings.remindersEnabled);
        toggle.onChange((value) => {
          settings.remindersEnabled = value;
          void this.plugin.saveSettings();
          this.plugin.remindersChanged();
          syncDependent();
        });
      });

    dependent.push(
      new Setting(containerEl)
        .setName("On start-up")
        .setDesc("Show a notice when Obsidian opens with cards waiting.")
        .addToggle((toggle) => {
          toggle.setValue(settings.remindOnStartup);
          toggle.onChange((value) => {
            settings.remindOnStartup = value;
            void this.plugin.saveSettings();
          });
        }).settingEl,
    );

    const repeat = new Setting(containerEl).setDesc(
      "Hours between reminders while Obsidian stays open. Zero means only on start-up.",
    );
    const repeatName = (hours: number): string =>
      hours === 0 ? "Repeat: only on start-up" : `Repeat every ${hours} h`;
    repeat.setName(repeatName(settings.remindEveryHours)).addSlider((slider) => {
      slider.setLimits(0, 12, 1).setValue(settings.remindEveryHours);
      // Dragging fires per step, so the name follows the handle but the setting
      // is only saved — and the reminder clock only re-armed — once it is let go.
      slider.onChange((value) => {
        repeat.setName(repeatName(value));
      });
      slider.sliderEl.addEventListener("change", () => {
        settings.remindEveryHours = slider.getValue();
        void this.plugin.saveSettings();
        this.plugin.remindersChanged();
      });
    });
    dependent.push(repeat.settingEl);

    dependent.push(
      new Setting(containerEl)
        .setName("Status bar counter")
        .setDesc("Show how many cards are due; click it to start reviewing.")
        .addToggle((toggle) => {
          toggle.setValue(settings.statusBarCounter);
          toggle.onChange((value) => {
            settings.statusBarCounter = value;
            void this.plugin.saveSettings();
            this.plugin.remindersChanged();
          });
        }).settingEl,
    );

    syncDependent();
  }
}
