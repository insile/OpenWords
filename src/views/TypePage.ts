import { Setting, Notice } from 'obsidian';
import { MainView } from './MainView';

export function TypePage(this: MainView) {
    this.viewContainer.empty();

    const typeContainer = this.viewContainer.createDiv({ cls: 'openwords-type-container' });
	typeContainer.createDiv({ cls: 'openwords-type-title', text: 'OpenWords' });
    const buttonContainer = typeContainer.createDiv({ cls: 'openwords-type-button-grid' });

    new Setting(buttonContainer)
        .setName(`学习新词`)
        .addButton(btn => btn
            .setButtonText("开始")
            .onClick(() => {
                if (this.plugin.newCards.size > 0) {
                    this.page = 'new';
                    void this.render();
                } else {
                    new Notice("没有新词可学了！");
                }
            }));

    new Setting(buttonContainer)
        .setName(`复习旧词`)
        .addButton(btn => btn
            .setButtonText("开始")
            .onClick(() => {
                if (this.plugin.dueCards.size > 0) {
                    this.page = 'old';
                    void this.render();
                } else {
                    new Notice("没有需要复习的单词！");
                }
            }));

    new Setting(buttonContainer)
        .setName('默写单词')
        .addButton(btn => btn
            .setButtonText('开始')
            .onClick(() => {
                if (this.plugin.dueCards.size > 0) {
                    this.page = 'spelling';
                    void this.render();
                } else {
                    new Notice("没有需要默写的单词！");
                }
            }));
}
