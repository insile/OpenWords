import { Notice, Setting } from "obsidian";
import { OpenWordsView } from "./main-view";

export class HomePage {
    view: OpenWordsView;

    constructor(view: OpenWordsView) {
        this.view = view;
        this.view.viewContainer.empty();
    }

    async render() {
        const typeContainer = this.view.viewContainer.createDiv({ cls: 'openwords-type-container' });
        typeContainer.createDiv({ cls: 'openwords-type-title', text: 'OpenWords' });
        const buttonContainer = typeContainer.createDiv({ cls: 'openwords-type-button-grid' });
        const buttons: HTMLElement[] = [];
        await this.newbuttonClick(buttonContainer, buttons);

        typeContainer.setAttribute('tabindex', '0');
        typeContainer.focus();
        
        typeContainer.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'q' && buttons[0]) {
                e.preventDefault();
                buttons[0].click();
            } else if (e.key === 'w' && buttons[1]) {
                e.preventDefault();
                buttons[1].click();
            } else if (e.key === 'e' && buttons[2]) {
                e.preventDefault();
                buttons[2].click();
            }
        });
    }

    async newbuttonClick(buttonContainer: HTMLDivElement, buttons: HTMLElement[]) {
        new Setting(buttonContainer)
            .setName(`学习新词`)
            .addButton(btn => {
                const button = btn
                    .setButtonText("开始")
                    .onClick(async () => {
                        if (this.view.plugin.newCards.size > 0) {
                            this.view.page = 'new';
                            await this.view.render();
                        } else {
                            new Notice("没有新词可学了！");
                        }
                    });
                buttons.push(button.buttonEl);
                return button;
            });

        new Setting(buttonContainer)
            .setName(`复习旧词`)
            .addButton(btn => {
                const button = btn
                    .setButtonText("开始")
                    .onClick(async () => {
                        if (this.view.plugin.dueCards.size > 0) {
                            this.view.page = 'old';
                            await this.view.render();
                        } else {
                            new Notice("没有需要复习的单词！");
                        }
                    });
                buttons.push(button.buttonEl);
                return button;
            });

        new Setting(buttonContainer)
            .setName('默写单词')
            .addButton(btn => {
                const button = btn
                    .setButtonText('开始')
                    .onClick(async () => {
                        if (this.view.plugin.dueCards.size > 0) {
                            this.view.page = 'spelling';
                            await this.view.render();
                        } else {
                            new Notice("没有需要默写的单词！");
                        }
                    });
                buttons.push(button.buttonEl);
                return button;
            });
    }
}