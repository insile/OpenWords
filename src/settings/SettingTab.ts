import { App, Notice, PluginSettingTab, Setting, normalizePath } from 'obsidian';
import { FolderSuggest, TagHistorySuggest } from '../utils/InputSuggest';
import { DEFAULT_SETTINGS } from './SettingData';
import OpenWords from '../main';


// 插件设置选项卡
export class OpenWordsSettingTab extends PluginSettingTab {
    plugin: OpenWords;

    constructor(app: App, plugin: OpenWords) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        // 初始化设置快照
        this.plugin.settingsSnapshot = Object.assign({}, this.plugin.settings);
        this.plugin.settingsSnapshot.enabledTags = [...this.plugin.settings.enabledTags];
        this.plugin.settingsSnapshot.tagHistory = [...(this.plugin.settings.tagHistory || this.plugin.settings.enabledTags)];

        // 初始化设置界面
        this.createPathSettings(containerEl);
        this.createTagManagement(containerEl);
        this.createActionButtons(containerEl);
    }

    private createPathSettings(container: HTMLElement) {
        new Setting(container)
            .setName('单词文件夹路径')
            .setDesc('指定存放单词文件的文件夹路径，默认为 "仓库:/"')
            .addText(text => {
                const input = text.setValue(this.plugin.settings.folderPath);
                new FolderSuggest(this.app, input.inputEl);
                input.onChange(async (value) => {
                    this.plugin.settingsSnapshot.folderPath = normalizePath(value);
                });
            });
        new Setting(container)
            .setName('索引文件夹路径')
            .setDesc('指定存放索引文件的文件夹路径，默认为 "仓库:索引"')
            .addText(text => {
                const input = text.setValue(this.plugin.settings.indexPath);
                new FolderSuggest(this.app, input.inputEl);
                input.onChange(async (value) => {
                    this.plugin.settingsSnapshot.indexPath = normalizePath(value);
                });
            });
    }

    private createTagManagement(containerEl: HTMLElement) {
        const tagsSetting = new Setting(containerEl);
        tagsSetting.setName('启用的标签')
            .setDesc('选择要启用的标签，点击下方按钮可添加更多标签');

        const tagsContainer = containerEl.createDiv({ cls: 'openwords-tags-container' });
        tagsSetting.settingEl.appendChild(tagsContainer);

        const renderTags = () => {
            tagsContainer.empty();
            if (this.plugin.settingsSnapshot.enabledTags.length === 0) {
                tagsContainer.createEl('p', { text: '暂无启用的标签', cls: 'openwords-empty-tags' });
            } else {
                this.plugin.settingsSnapshot.enabledTags.forEach((tag, index) => {
                    const tagEl = tagsContainer.createEl('div', { cls: 'openwords-tag-item' });
                    tagEl.createEl('span', { text: tag });
                    tagEl.createEl('button', { text: '删除' }).onclick = () => {
                        this.plugin.settingsSnapshot.enabledTags.splice(index, 1);
                        renderTags();
                    };
                });
            }
        };

        // 添加标签输入与历史建议
        new Setting(containerEl)
            .setName('添加标签')
            .setDesc('输入新的标签名称，例如 "级别/小学"')
            .addText(text => {
                text.setPlaceholder('输入标签名称');
                text.onChange(async (value) => {
                    (text.inputEl as any).currentValue = value;
                });

                new TagHistorySuggest(
                    this.app,
                    text.inputEl,
                    this.plugin.settingsSnapshot.tagHistory || [],
                    (selectedValue) => text.setValue(selectedValue),
                    async (valueToDelete) => {
                        const index = this.plugin.settingsSnapshot.tagHistory.indexOf(valueToDelete);
                        if (index > -1) {
                            this.plugin.settingsSnapshot.tagHistory.splice(index, 1);
                        }
                    }
                );

                text.inputEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const value = (text.inputEl as any).value?.trim();
                        if (value && !this.plugin.settingsSnapshot.enabledTags.includes(value)) {
                            this.plugin.settingsSnapshot.enabledTags.push(value);
                            if (!this.plugin.settingsSnapshot.tagHistory.includes(value)) {
                                this.plugin.settingsSnapshot.tagHistory.push(value);
                            }
                            renderTags();
                            text.setValue('');
                        } else if (value && this.plugin.settingsSnapshot.enabledTags.includes(value)) {
                            new Notice('该标签已存在！');
                        }
                    }
                });
            })
            .addButton(button => button
                .setButtonText('添加')
                .onClick(() => {
                    const inputs = containerEl.querySelectorAll('input[type="text"]');
                    let tagInput = '';
                    for (let i = inputs.length - 1; i >= 0; i--) {
                        const input = inputs[i] as HTMLInputElement;
                        if (input.placeholder === '输入标签名称') {
                            tagInput = input.value?.trim() || '';
                            break;
                        }
                    }
                    if (tagInput && !this.plugin.settingsSnapshot.enabledTags.includes(tagInput)) {
                        this.plugin.settingsSnapshot.enabledTags.push(tagInput);
                        if (!this.plugin.settingsSnapshot.tagHistory.includes(tagInput)) {
                            this.plugin.settingsSnapshot.tagHistory.push(tagInput);
                        }
                        renderTags();
                        for (let i = inputs.length - 1; i >= 0; i--) {
                            const input = inputs[i] as HTMLInputElement;
                            if (input.placeholder === '输入标签名称') {
                                input.value = '';
                                break;
                            }
                        }
                    } else if (tagInput && this.plugin.settingsSnapshot.enabledTags.includes(tagInput)) {
                        new Notice('该标签已存在！');
                    } else {
                        new Notice('请输入标签名称！');
                    }
                }));

        renderTags();
    }

    private createActionButtons(containerEl: HTMLElement) {
        new Setting(containerEl)
            .setName('扫描单词')
            .setDesc('按路径和级别设置扫描并缓存单词')
            .addButton(button => button
                .setButtonText('扫描')
                .setCta()
                .onClick(async () => {
                    if (button.disabled) return;
                    button.setDisabled(true);
                    button.setButtonText('处理中...');
                    try {
                        this.plugin.settings = {...this.plugin.settingsSnapshot};
                        this.plugin.settings.enabledTags = [...this.plugin.settingsSnapshot.enabledTags];
                        this.plugin.settings.tagHistory = [...(this.plugin.settingsSnapshot.tagHistory || this.plugin.settingsSnapshot.enabledTags)];
                        await this.plugin.saveSettings();
                        // 重新初始化文件监听器
                        await this.plugin.reinitializeFileWatchers();
                        await this.plugin.scanAllNotes();
                        new Notice(`扫描完成！共 ${this.plugin.allCards.size} 个单词`);
                        await this.plugin.createWordStatusBaseFile();
                        this.plugin.updateStatusBar();
                    } catch (error) {
                        console.error('缓存过程中发生错误:', error);
                        new Notice('缓存失败，请检查控制台日志！');
                    } finally {
                        button.setDisabled(false);
                        button.setButtonText('扫描');
                    }
            }));

        new Setting(containerEl)
            .setName('生成索引')
            .setDesc('按标签生成所有单词的首字母索引文件')
            .addButton(button => button
                .setButtonText('索引')
                .onClick(async () => {
                    if (button.disabled) return;
                    button.setDisabled(true);
                    button.setButtonText('处理中...');
                    try {
                        await this.plugin.generateIndex();
                    } catch (error) {
                        console.error('生成索引过程中发生错误:', error);
                        new Notice('生成索引失败，请检查控制台日志！');
                    } finally {
                        button.setDisabled(false);
                        button.setButtonText('生成');
                    }
            }));

        new Setting(containerEl)
            .setName("随机调度概率")
            .setDesc("设置每次抽卡时随机调度的概率，其余为优先调度概率")
            .addDropdown(dropdown => {
                for (let i = 0; i <= 10; i++) {
                    const value = (i / 10).toFixed(1);
                    dropdown.addOption(value, value);
                }
                dropdown.setValue(this.plugin.settings.randomRatio.toFixed(1));
                dropdown.onChange(async (value) => {
                    this.plugin.settings.randomRatio = Number(value);
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName("最大双链因子")
            .setDesc("易记因子小于等于该值的单词可添加双链")
            .addDropdown(dropdown => {
                for (let i = 0; i < 10; i++) {
                    const value = (1.2 + i * 0.2).toFixed(1);
                    dropdown.addOption(value, value);
                }
                dropdown.setValue(this.plugin.settings.maxEfactorForLink.toFixed(1));
                dropdown.onChange(async (value) => {
                    this.plugin.settings.maxEfactorForLink = Number(value);
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('恢复默认设置')
            .setDesc('将所有插件设置恢复为默认值')
            .addButton(button => button
                .setButtonText('恢复默认设置')
                .onClick(async () => {
                    if (button.disabled) return;
                    button.setDisabled(true);
                    button.setButtonText('处理中...');
                    try {
                        this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
                        await this.plugin.saveSettings();
                        new Notice('已恢复默认设置');
                        // 重新渲染设置页以反映默认值
                        this.display();
                        this.plugin.settings = {...this.plugin.settingsSnapshot};
                        this.plugin.settings.enabledTags = [...this.plugin.settingsSnapshot.enabledTags];
                        this.plugin.settings.tagHistory = [...(this.plugin.settingsSnapshot.tagHistory || this.plugin.settingsSnapshot.enabledTags)];
                        await this.plugin.saveSettings();
                        // 重新初始化文件监听器
                        await this.plugin.reinitializeFileWatchers();
                        await this.plugin.scanAllNotes();
                        new Notice(`扫描完成！共 ${this.plugin.allCards.size} 个单词`);
                        await this.plugin.createWordStatusBaseFile();
                        this.plugin.updateStatusBar();
                    } catch (error) {
                        console.error('恢复默认设置失败:', error);
                        new Notice('恢复失败，请检查控制台日志！');
                    } finally {
                        button.setDisabled(false);
                        button.setButtonText('恢复默认设置');
                    }
                }));

        new Setting(containerEl)
            .setName('重置单词属性')
            .setDesc('重置作用域单词的易记因子、重复次数、间隔和到期日')
            .addButton(button => button
                .setButtonText('重置单词属性')
                .onClick(async () => {
                    if (button.disabled) return;
                    button.setDisabled(true);
                    button.setButtonText('处理中...');
                    try {
                        await this.plugin.resetCard();
                    } catch (error) {
                        console.error('重置过程中发生错误:', error);
                        new Notice('重置失败，请检查控制台日志！');
                    } finally {
                        button.setDisabled(false);
                        button.setButtonText('重置单词属性');
                    }
            }));
    }
}
