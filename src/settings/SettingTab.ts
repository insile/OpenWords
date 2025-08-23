import { App, Notice, PluginSettingTab, Setting, normalizePath } from 'obsidian';
import { FolderSuggest } from '../utils/InputSuggest';
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
        const textContainer = containerEl.createDiv({ cls: 'openwords-text-grid' });
        const toggleContainer = containerEl.createDiv({ cls: 'openwords-toggle-grid' });
        this.plugin.settingsSnapshot = Object.assign({}, this.plugin.settings); // 创建设置快照
        new Setting(textContainer)
            .setName('单词文件夹路径')
            .setDesc('指定存放单词文件的文件夹路径，默认为仓库:/')
            .addText(text => {
                const input = text.setValue(this.plugin.settings.folderPath);
                new FolderSuggest(this.app, input.inputEl); // 添加文件夹路径自动补全支持
                input.onChange(async (value) => {
                    this.plugin.settingsSnapshot.folderPath = normalizePath(value);
                });
            });
        new Setting(textContainer)
            .setName('索引文件夹路径')
            .setDesc('指定存放索引文件的文件夹路径，默认为仓库:索引')
            .addText(text => {
                const input = text.setValue(this.plugin.settings.indexPath);
                new FolderSuggest(this.app, input.inputEl); // 添加文件夹路径自动补全支持
                input.onChange(async (value) => {
                    this.plugin.settingsSnapshot.indexPath = normalizePath(value);
                });
            });
        new Setting(toggleContainer)
            .setName('小学')
            .setDesc('启用小学单词')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWords1)
                .onChange(async (value) => {
                    this.plugin.settingsSnapshot.enableWords1 = value;
            }));
        new Setting(toggleContainer)
            .setName('中考')
            .setDesc('启用中考单词')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWords2)
                .onChange(async (value) => {
                    this.plugin.settingsSnapshot.enableWords2 = value;
            }));
        new Setting(toggleContainer)
            .setName('高四')
            .setDesc('启用高四单词')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWords3)
                .onChange(async (value) => {
                    this.plugin.settingsSnapshot.enableWords3 = value;
            }));
        new Setting(toggleContainer)
            .setName('考研')
            .setDesc('启用考研单词')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWords4)
                .onChange(async (value) => {
                    this.plugin.settingsSnapshot.enableWords4 = value;
            }));
        new Setting(toggleContainer)
            .setName('六级')
            .setDesc('启用六级单词')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWords5)
                .onChange(async (value) => {
                    this.plugin.settingsSnapshot.enableWords5 = value;
            }));
        new Setting(toggleContainer)
            .setName('雅思')
            .setDesc('启用雅思单词')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWords6)
                .onChange(async (value) => {
                    this.plugin.settingsSnapshot.enableWords6 = value;
            }));
        new Setting(toggleContainer)
            .setName('托福')
            .setDesc('启用托福单词')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWords7)
                .onChange(async (value) => {
                    this.plugin.settingsSnapshot.enableWords7 = value;
            }));
        new Setting(toggleContainer)
            .setName('GRE')
            .setDesc('启用GRE单词')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWords8)
                .onChange(async (value) => {
                    this.plugin.settingsSnapshot.enableWords8 = value;
            }));
        new Setting(containerEl)
            .setName('扫描单词')
            .setDesc('按路径和级别设置扫描并缓存单词')
            .addButton(button => button
                .setButtonText('扫描')
                .setCta() // 设置为主要按钮样式
                .onClick(async () => {
                    if (button.disabled) return; // 如果按钮已禁用，直接返回

                    button.setDisabled(true); // 禁用按钮
                    button.setButtonText('处理中...'); // 更新按钮文本

                    try {
                        this.plugin.settings = {...this.plugin.settingsSnapshot}; // 更新插件设置
                        await this.plugin.saveSettings(); // 保存设置
                        await this.plugin.scanAllNotes(); // 重新缓存单词
                        new Notice(`扫描完成！共 ${this.plugin.allCards.size} 个单词`); // 完成后更新消息
                        this.plugin.updateStatusBar(); // 更新状态栏
                    } catch (error) {
                        console.error('缓存过程中发生错误:', error);
                        new Notice('缓存失败，请检查控制台日志！');
                    } finally {
                        button.setDisabled(false); // 重新启用按钮
                        button.setButtonText('扫描'); // 恢复按钮文本
                    }
            }));
        new Setting(containerEl)
            .setName('生成索引')
            .setDesc('按级别生成所有单词的首字母索引文件')
            .addButton(button => button
                .setButtonText('索引')
                .onClick(async () => {
                    if (button.disabled) return; // 如果按钮已禁用，直接返回

                    button.setDisabled(true); // 禁用按钮
                    button.setButtonText('处理中...'); // 更新按钮文本

                    try {
                        await this.plugin.generateIndex(); // 生成索引文件
                    } catch (error) {
                        console.error('生成索引过程中发生错误:', error);
                        new Notice('生成索引失败，请检查控制台日志！');
                    } finally {
                        button.setDisabled(false); // 重新启用按钮
                        button.setButtonText('生成'); // 恢复按钮文本
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
            .setName('重置单词属性')
            .setDesc('重置作用域单词的易记因子、重复次数、间隔和到期日')
            .addButton(button => button
                .setButtonText('重置')
                .onClick(async () => {
                    if (button.disabled) return; // 如果按钮已禁用，直接返回

                    button.setDisabled(true); // 禁用按钮
                    button.setButtonText('处理中...'); // 更新按钮文本

                    try {
                        await this.plugin.resetCard(); // 重置单词属性
                    } catch (error) {
                        console.error('重置过程中发生错误:', error);
                        new Notice('重置失败，请检查控制台日志！');
                    } finally {
                        button.setDisabled(false); // 重新启用按钮
                        button.setButtonText('重置'); // 恢复按钮文本
                    }
            }));
    }
}
