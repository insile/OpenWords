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
        this.statusBarEl.setText(
            `${this.plugin.newCards.size} + ${Array.from(this.plugin.dueCards.values())
            .filter(card => window.moment(card.dueDate).isBefore(window.moment())).length} / ${this.plugin.dueCards.size} + ${this.plugin.allCards.size - this.plugin.enabledCards.size} = ${this.plugin.allCards.size}`
        );
    }
}
