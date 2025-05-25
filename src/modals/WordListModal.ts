import { App, Modal, Notice, Setting, MarkdownRenderer, TFile, Component } from 'obsidian';
import OpenWords from '../main';

// 单词列表模态框
export class WordListModal extends Modal {
    plugin: OpenWords;
    component: Component;
    selectedLetter: string | null = null; // 当前选中的首字母
    selectedLevel: string | null = null; // 当前选中的级别

    constructor(app: App, plugin: OpenWords) {
        super(app);
        this.plugin = plugin;
        this.component = new Component();
    }

    async onOpen() {
        this.modalEl.addClass('openwords-list');
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createDiv({ cls: 'openwords-list-title', text: '掌握列表' });
        const filterContainer = contentEl.createDiv({ cls: 'openwords-list-filters' });
        const listContainer = contentEl.createDiv({ cls: 'openwords-list-container' });
        this.component.load()
        // 添加首字母筛选
        new Setting(filterContainer)
            .setName('首字母筛选')
            .addDropdown(dropdown => {
                dropdown.addOption('', '全部');
                for (let i = 65; i <= 90; i++) {
                    const letter = String.fromCharCode(i);
                    dropdown.addOption(letter, letter);
                }
                dropdown.setValue(this.selectedLetter || '');
                dropdown.onChange(value => {
                    this.selectedLetter = value || null;
                    this.renderWordList(listContainer);
                });
            });

        // 添加级别筛选
        new Setting(filterContainer)
            .setName('级别筛选')
            .addDropdown(dropdown => {
                dropdown.addOption('', '全部');
                const levels = [
                    '级别/小学', '级别/中考', '级别/高考四级', '级别/考研',
                    '级别/六级', '级别/雅思', '级别/托福', '级别/GRE'
                ];
                levels.forEach(level => dropdown.addOption(level, level.split('/')[1]));
                dropdown.setValue(this.selectedLevel || '');
                dropdown.onChange(value => {
                    this.selectedLevel = value || null;
                    this.renderWordList(listContainer);
                });
            });

        // 初始不渲染单词列表
        listContainer.createDiv({ text: '请选择筛选条件以查看单词列表。' });
    }

    renderWordList(container: HTMLElement) {
        container.empty();

        // 如果没有选择筛选条件，则不渲染内容
        if (!this.selectedLetter && !this.selectedLevel) {
            container.createDiv({ text: '请选择筛选条件以查看单词列表。' });
            return;
        }


        // 根据筛选条件过滤单词
        const filteredWords = Array.from(this.plugin.allCards.values()).filter(card => {

            const file = this.plugin.app.vault.getFileByPath(card.path);
            if (file instanceof TFile) {
                const matchesLetter = this.selectedLetter
                    ? card.front.startsWith(this.selectedLetter.toLowerCase())
                    : true;
                const matchesLevel = this.selectedLevel
                    ? this.plugin.app.metadataCache.getFileCache(file)?.frontmatter?.tags?.includes(this.selectedLevel)
                    : true;
                return matchesLetter && matchesLevel;
            }
        }).sort((a, b) => a.front.localeCompare(b.front)); // 按字母顺序排序

        // 渲染单词列表
        if (filteredWords.length === 0) {
            container.createDiv({ text: '没有符合条件的单词。' });
            return;
        }

        filteredWords.forEach(card => {
            const wordItem = container.createDiv({ cls: 'openwords-list-item' });
            // 左侧显示单词
            const wordText = wordItem.createDiv({ cls: 'openwords-list-text', text: card.front });
            const toggleContainer = wordItem.createDiv({ cls: 'toggle-container' });

            new Setting(toggleContainer)
                // .setName(card.front)
                .addToggle(toggle => {
                    toggle.setValue(card.isMastered) // 设置初始复选框状态
                        .onChange(async (value) => {
                            const file = this.plugin.app.vault.getFileByPath(card.path);
                            if (!(file instanceof TFile)) return; // 如果文件不存在，直接返回
                            // 更新单词的掌握状态
                            await this.plugin.app.fileManager.processFrontMatter(
                                file, (frontMatter) => {frontMatter["掌握"] = value;}
                            );
                            new Notice(`单词 "${card.front}" 已更新为 ${value ? '掌握' : '未掌握'}`);
                        });
                });
            // 创建 Markdown 预览容器
            const previewContainer = wordText.createDiv({ cls: 'openwords-list-preview' });

            // 添加鼠标悬停事件以渲染 Markdown 内容
            wordText.addEventListener('mouseenter', async () => {
                const file = this.plugin.app.vault.getFileByPath(card.path);
                if (file instanceof TFile) {
                    const markdownContent = await this.plugin.app.vault.cachedRead(file);
                    previewContainer.empty();
                    await MarkdownRenderer.render(
                        this.app,
                        markdownContent,
                        previewContainer,
                        file.path,
                        this.component
                    );
                }
            });

            // 鼠标离开时清空预览内容
            wordText.addEventListener('mouseleave', () => {
                previewContainer.empty();
            });
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        this.component.unload();
    }
}
