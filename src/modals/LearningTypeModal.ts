import { App, Modal, Notice, Setting } from 'obsidian';
import { LearningModal } from './LearningModal';
import { WordListModal } from './WordListModal';
import { SpellingModal } from './SpellingModal';
import OpenWords from '../main';


// 学习模式模态框
export class LearningTypeModal extends Modal {
    plugin: OpenWords;

    constructor(app: App, plugin: OpenWords) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        this.modalEl.addClass('openwords-type-modal'); // 添加自定义样式类
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createDiv({ cls: 'openwords-type-title', text: '选择学习模式' });
        const buttonContainer = contentEl.createDiv({ cls: 'openwords-type-button-grid' });

        new Setting(buttonContainer)
            .setName(`学习新词 ( 重复次数为零, 剩余 ${this.plugin.newCards.size} )`)
            .addButton(btn => btn
                .setButtonText("开始")
                .onClick(() => {
                    if (this.plugin.newCards.size > 0) {
                    this.close();
                    new LearningModal(this.app, this.plugin, 'new').open();
                    } else {
                    new Notice("没有新词可学了！");
                    }
            }));

        new Setting(buttonContainer)
            .setName(`复习旧词 ( 重复次数不为零, 共计 ${this.plugin.dueCards.size}, 过期 ${Array.from(this.plugin.dueCards.values())
				.filter(card => window.moment(card.dueDate).isBefore(window.moment())).length} )`)
            .addButton(btn => btn
                .setButtonText("开始")
                .onClick(() => {
                    if (this.plugin.dueCards.size > 0) {
                    this.close();
                    new LearningModal(this.app, this.plugin, 'review').open();
                    } else {
                    new Notice("没有需要复习的卡片！");
                    }
            }));

        new Setting(buttonContainer)
            .setName(`掌握列表 ( 所有单词, 掌握 ${this.plugin.masterCards.size} )`)
            .addButton(btn => btn
                .setButtonText("开始")
                .onClick(() => {
                    this.close();
                    new WordListModal(this.app, this.plugin).open();
            }));

        new Setting(buttonContainer)
            .setName('默写单词 ( 启用单词 )')
            .addButton(btn => btn
                .setButtonText('开始')
                .onClick(() => {
                    this.close();
                    new SpellingModal(this.app, this.plugin).open();
            }));

        new Setting(buttonContainer)
            .setName(`添加双链 ( 启用单词中易记因子 <= 2.5 )`)
            .addButton(btn => btn
                .setButtonText("开始")
                .onClick(async () => {
                    this.close();
                    await this.plugin.addDoubleBrackets();
			}));
    }
}
