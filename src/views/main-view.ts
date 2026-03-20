import { ItemView, WorkspaceLeaf, Component, Notice } from 'obsidian';
import OpenWords from '../main';
import { createWordStatusBaseFile } from 'service/index-manager';
import { HomePage } from './home-page';
import { LearningPage } from './learning-page';
import { SpellingPage } from './spelling-page';

export const OPENWORDS_VIEW = "openwords-view";
export type PageType = 'home' | 'new' | 'old' | 'spelling';

export class OpenWordsView extends ItemView {
    // 主视图
    plugin: OpenWords;
    page: PageType = 'home';
    component: Component;
    viewContainer: HTMLDivElement;
    statusBarEl: HTMLDivElement;
    homepage: HomePage;
    learningpage: LearningPage;
    spellingpage: SpellingPage;
    
    constructor(leaf: WorkspaceLeaf, plugin: OpenWords) {
        super(leaf);
        this.plugin = plugin;
        this.component = new Component();
    }

    getViewType() { return OPENWORDS_VIEW; }
    // eslint-disable-next-line obsidianmd/ui/sentence-case
    getDisplayText() { return "OpenWords"; }
    getIcon(): string { return "slack"; }

    async onOpen() {
        this.component.load();
        const container = this.containerEl.querySelector('.view-content') as HTMLElement;
        this.viewContainer = container.createDiv({ cls: 'openwords-view-container' });
        this.statusBarEl = container.createDiv({ cls: 'openwords-view-statusbar' });
        await this.render();
        this.updateStatusBar();
    }

    async onClose() {
        this.containerEl.empty();
        this.component.unload();
    }

    async render() {
        this.viewContainer.empty();

        switch (this.page) {
            case 'home':
                this.homepage = new HomePage(this);
                await this.homepage.render();
                break;
            case 'new':
                this.learningpage = new LearningPage(this);
                await this.learningpage.render();
                break;
            case 'old':
                this.learningpage = new LearningPage(this);
                await this.learningpage.render();
                break;
            case 'spelling':
                this.spellingpage = new SpellingPage(this);
                await this.spellingpage.render();
                break;
        }
    }

    updateStatusBar() {
        if (!this.statusBarEl) return;

        // 计算各分类的单词数
        const newCount = this.plugin.newCards.size;
        const dueTodayCount = Array.from(this.plugin.dueCards.values())
            .filter(card => window.moment(card.dueDate).isBefore(window.moment())).length;
        const reviewCount = this.plugin.dueCards.size - dueTodayCount;
        const masteredCount = this.plugin.masterCards.size;
        const disabledCount = this.plugin.allCards.size - this.plugin.enabledCards.size;
        const totalCount = this.plugin.allCards.size;

        // 清空状态栏
        this.statusBarEl.empty();

        // 创建第一行：待学习、待复习、今日到期、已掌握、未启用
        const row1 = this.statusBarEl.createDiv({ cls: 'openwords-statusbar-row' });

        this.createStatItem(row1, '待学习', newCount);
        this.createStatItem(row1, '待复习', reviewCount);
        this.createStatItem(row1, '今日到期', dueTodayCount);
        this.createStatItem(row1, '已掌握', masteredCount);
        this.createStatItem(row1, '未启用', disabledCount);

        // 创建第二行：总计
        const row2 = this.statusBarEl.createDiv({ cls: 'openwords-statusbar-row openwords-statusbar-total' });
        this.createStatItem(row2, '总计', totalCount, true);
    }

    private createStatItem(container: HTMLElement, label: string, count: number, isTotal: boolean = false) {
        const item = container.createDiv({ cls: isTotal ? 'openwords-stat-item total' : 'openwords-stat-item' });
        item.createSpan({ cls: 'openwords-stat-label', text: label });
        item.createSpan({ cls: 'openwords-stat-count', text: count.toString() });

        // 添加点击事件，打开对应的视图
        if (isTotal) {
            item.addEventListener('click', () => {
                // 使用立即执行的异步函数，并标记为 void
                void (async () => {
                    try {
                        // 创建单词状态 .base 文件
                        await createWordStatusBaseFile(this.plugin);

                        const basePath = `${this.plugin.settings.indexPath}/英语单词状态.base`;
                        const file = this.app.vault.getFileByPath(basePath);

                        if (!file) {
                            new Notice('单词状态文件不存在，请先生成索引');
                            return;
                        }

                        // 打开 .base 文件
                        const leaf = this.app.workspace.getLeaf(false);
                        await leaf.openFile(file);
                    } catch (error) {
                        new Notice(`打开文件失败: ${String(error)}`);
                        console.error('Open base file error:', error);
                    }
                })();
            });
        };
    }
}
