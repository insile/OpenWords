import { ItemView, WorkspaceLeaf, Component } from 'obsidian';
import { TypePage } from './TypePage';
import { SpellingPage, pickNextSCard, renderInput, checkSpelling } from './SpellingPage';
import { LearningPage, pickNextLCard, renderCard, renderSettings, rateCard, registerRatingKeyEvents, registerRenderKeyEvents } from './LearningPage';
import { CardInfo } from '../utils/Card';
import OpenWords from '../main';

export const MAIN_VIEW = "openwords-view";
export type PageType = 'type' | 'new' | 'old' | 'spelling';

export class MainView extends ItemView {
    // 主视图
    plugin: OpenWords;
    page: PageType = 'type';
    component: Component;
    viewContainer: HTMLDivElement;
    statusBarEl: HTMLDivElement;
    // 学习分类页面
    TypePage = TypePage;
    // 单词学习页面
    currentLearingCard: CardInfo | null = null;
    isRating = false;
    currentRatingKey: string | null = null;
    LearningPage = LearningPage
    pickNextLCard = pickNextLCard;
    renderCard = renderCard;
    renderSettings = renderSettings;
    rateCard = rateCard;
    registerRatingKeyEvents = registerRatingKeyEvents;
    registerRenderKeyEvents = registerRenderKeyEvents;
    // 单词拼写页面
    currentSpellingCard: CardInfo | null = null;
    selectedLetter: string | null = null;
    selectedLevel: string | null = null;
    hasPeeked = false;
    errorCount = 0;
    SpellingPage = SpellingPage
    pickNextSCard = pickNextSCard
    renderInput = renderInput
    checkSpelling = checkSpelling;

    constructor(leaf: WorkspaceLeaf, plugin: OpenWords) {
        super(leaf);
        this.plugin = plugin;
        this.component = new Component();
    }

    getViewType() { return MAIN_VIEW; }
    getDisplayText() { return "OpenWords"; }
    getIcon(): string { return "slack"; }

    async onOpen() {
        this.component.load();
        const container = this.containerEl.querySelector('.view-content') as HTMLElement;
        this.viewContainer = container.createDiv({ cls: 'openwords-view-container' });
        this.statusBarEl = container.createDiv({ cls: 'openwords-view-statusbar' });
        await this.render();
        await this.updateStatusBar();
    }

    async onClose() {
        this.containerEl.empty();
        this.component.unload();
    }

    async render() {
        this.viewContainer.empty();

        switch (this.page) {
            case 'type':
                this.TypePage();
                break;
            case 'new':
                await this.LearningPage();
                break;
            case 'old':
                await this.LearningPage();
                break;
            case 'spelling':
                await this.SpellingPage();
                break;
        }
    }

    async updateStatusBar() {
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
        
        // 创建第一行：新单词、待复习、今日到期、已掌握、未启用
        const row1 = this.statusBarEl.createDiv({ cls: 'openwords-statusbar-row' });
        
        this.createStatItem(row1, '新单词', newCount);
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
    }
}
