import { ItemView, WorkspaceLeaf, Component, Notice, TFile, debounce } from 'obsidian';
import OpenWords from '../main';
import { createWordStatusBaseFile } from '../service/index-manager';
import { HomePage } from './home-page';
import { LearningPage } from './learning-page';
import { SpellingPage } from './spelling-page';
import { CardInfo } from 'utils/card-info';

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
    statsMap: Map<string, HTMLElement> = new Map();

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
        this.statusBarEl.empty();

        // 定义需要显示的项 [Label, isTotal?]
        const items: [string, boolean][] = [
            ['待学习', false], ['待复习', false], ['今日到期', false],
            ['已掌握', false], ['未启用', false], ['总计', true]
        ];

        const row1 = this.statusBarEl.createDiv({ cls: 'openwords-statusbar-row' });
        const row2 = this.statusBarEl.createDiv({ cls: 'openwords-statusbar-row openwords-statusbar-total' });

        items.forEach(([label, isTotal]) => {
            const container = isTotal ? row2 : row1;
            const itemEl = container.createDiv({ cls: `openwords-stat-item ${isTotal ? 'total' : ''}` });
            itemEl.createSpan({ cls: 'openwords-stat-label', text: label });

            // 存入 Map 方便后续直接更新文本
            const countEl = itemEl.createSpan({ cls: 'openwords-stat-count' });
            this.statsMap.set(label, countEl);

            if (isTotal) itemEl.onClickEvent(() => this.openStatusFile());
        });
        this.updateStatusBar()
        this.updateStatusBar = debounce(this.updateStatusBar.bind(this), 100);
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

    // 更新状态栏
    updateStatusBar() {
        const { plugin } = this;
        const now = window.moment();

        const dueToday = Array.from(plugin.dueCards.values())
            .filter((c: CardInfo) => window.moment(c.dueDate).isBefore(now)).length;

        const data: Record<string, number> = {
            '待学习': plugin.newCards.size,
            '待复习': plugin.dueCards.size - dueToday,
            '今日到期': dueToday,
            '已掌握': plugin.masterCards.size,
            '未启用': plugin.allCards.size - plugin.enabledCards.size,
            '总计': plugin.allCards.size
        };

        for (const [label, count] of Object.entries(data)) {
            const el = this.statsMap.get(label);
            if (el) el.textContent = count.toString();
        }
    }

    // 打开单词状态文件
    async openStatusFile() {
        try {
            await createWordStatusBaseFile(this.plugin);
            const path = `${this.plugin.settings.indexPath}/英语单词状态.base`;
            const file = this.app.vault.getAbstractFileByPath(path);

            if (file instanceof TFile) {
                await this.app.workspace.getLeaf(false).openFile(file);
            } else {
                new Notice('文件不存在，请先生成索引');
            }
        } catch {
            new Notice('打开失败');
        }
    }
}
