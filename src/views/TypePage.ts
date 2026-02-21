import { Setting, Notice } from 'obsidian';
import { MainView } from './MainView';

export function TypePage(this: MainView) {
    this.viewContainer.empty();

    const typeContainer = this.viewContainer.createDiv({ cls: 'openwords-type-container' });
	typeContainer.createDiv({ cls: 'openwords-type-title', text: 'OpenWords' });
    const buttonContainer = typeContainer.createDiv({ cls: 'openwords-type-button-grid' });

    const buttons: HTMLElement[] = [];

    new Setting(buttonContainer)
        .setName(`学习新词`)
        .addButton(btn => {
            const button = btn
                .setButtonText("开始")
                .onClick(() => {
                    if (this.plugin.newCards.size > 0) {
                        this.page = 'new';
                        void this.render();
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
                .onClick(() => {
                    if (this.plugin.dueCards.size > 0) {
                        this.page = 'old';
                        void this.render();
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
                .onClick(() => {
                    if (this.plugin.dueCards.size > 0) {
                        this.page = 'spelling';
                        void this.render();
                    } else {
                        new Notice("没有需要默写的单词！");
                    }
                });
            buttons.push(button.buttonEl);
            return button;
        });

    // 快捷键监听
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
