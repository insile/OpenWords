import { Setting, Notice, MarkdownRenderer, TFile } from 'obsidian';
import { SuperMemoGrade } from 'supermemo';
import { CardInfo } from '../utils/Card';
import { MainView } from './MainView';

export async function LearningPage(this: MainView) {

    this.currentLearingCard = this.pickNextLCard();
    if (!this.currentLearingCard) return;

    this.viewContainer.empty();
    const learningContainer = this.viewContainer.createDiv({ cls: 'openwords-learning-container' });
    const backBtn = learningContainer.createEl('button', { cls: 'openwords-back-btn' });
    const cardContainer = learningContainer.createDiv({ cls: 'openwords-learning-card' });
    const settingsContainer = learningContainer.createDiv({ cls: 'openwords-learning-settings' });

    backBtn.textContent = '返回';
    backBtn.onclick = () => {
        this.page = 'type';
        this.render();
    };

    this.renderCard(cardContainer);
    this.renderSettings(cardContainer, settingsContainer);

    this.registerRatingKeyEvents(learningContainer, cardContainer);
    this.registerRenderKeyEvents(learningContainer, cardContainer);
    learningContainer.tabIndex = 0;
    learningContainer.focus();
}

// 选卡逻辑
export function pickNextLCard(this: MainView) {
    const now = window.moment();
    let pool: CardInfo[];
    if (this.page === 'new') {  // 新词排序：间隔降序，间隔相同则易记因子升序
        pool = Array.from(this.plugin.newCards.values());
        if (pool.length === 0) {
            new Notice("已完成所有新词！");
            this.page = 'type';
            void this.render();
            return null;
        }
        pool.sort((a, b) => {
            const intervalA = Number(a.interval);
            const intervalB = Number(b.interval);
            if (intervalA !== intervalB) return intervalB - intervalA;
            const efactorA = Number(a.efactor);
            const efactorB = Number(b.efactor);
            return efactorA - efactorB;
        });
    } else {  // 旧词排序：易记因子升序，易记因子相同则重复次数升序
        pool = Array.from(this.plugin.dueCards.values())
            .filter(card => window.moment(card.dueDate).isBefore(now));
        if (pool.length === 0) {
            new Notice("没有需要复习的卡片！");
            this.page = 'type';
            void this.render();
            return null;
        }
        pool.sort((a, b) => {
            const efactorA = Number(a.efactor);
            const efactorB = Number(b.efactor);
            if (efactorA !== efactorB) return efactorA - efactorB;
            const repetitionA = Number(a.repetition);
            const repetitionB = Number(b.repetition);
            return repetitionA - repetitionB;
        });
    }
    const randomMode = Math.random() < this.plugin.settings.randomRatio;
    if (randomMode) {
        return pool[Math.floor(Math.random() * pool.length)] ?? null;
    } else {
        const topN = Math.max(1, Math.ceil(pool.length / 100));
        const topPool = pool.slice(0, topN);
        return topPool[Math.floor(Math.random() * topPool.length)] ?? null;
    }
}

// 卡片内容渲染
export function renderCard(this: MainView, cardContainer: HTMLDivElement) {
    cardContainer.empty();
    if (!this.currentLearingCard) return;
    const wordContent = cardContainer.createDiv({ cls: 'openwords-card-content' });
    wordContent.textContent = this.currentLearingCard.front;
    const file = this.plugin.app.vault.getFileByPath(this.currentLearingCard.path);
    if (!file) { return; }
    const fileCache = this.plugin.app.metadataCache.getFileCache(file);
    const frontMatter = fileCache?.frontmatter;
    if (!frontMatter) { return; }
    const tags: string[] = (frontMatter.tags || []).map((tag: string) => {
        const parts = tag.split('/');
        return parts.length > 1 ? parts[1] : tag;
    });
    const dueDate: string = frontMatter["到期日"];
    const interval: string = frontMatter["间隔"];
    const efactor: string = frontMatter["易记因子"];
    const repetition: string = frontMatter["重复次数"];

    const metaDiv = cardContainer.createDiv({ cls: 'openwords-card-meta' });
    const tagsDiv = metaDiv.createDiv({ cls: 'openwords-card-meta-tags' });
    tagsDiv.textContent = `标签: ${tags.join(', ')}`;
    const infoDiv = metaDiv.createDiv({ cls: 'openwords-card-meta-info' });
    infoDiv.textContent = `易记因子: ${efactor} | 重复次数: ${repetition} | 到期日: ${dueDate} | 间隔: ${interval} `;
}

// 评分按钮渲染
export function renderSettings(this: MainView, cardContainer: HTMLDivElement, settingsContainer: HTMLElement) {
    const grades: { grade: SuperMemoGrade, label: string }[] = [
        { grade: 0, label: '评分 1: 回答错误, 完全不会' },
        { grade: 1, label: '评分 2: 回答错误, 看到正确答案后感觉很熟悉' },
        { grade: 2, label: '评分 3: 回答错误, 看到正确答案后感觉很容易记住' },
        { grade: 3, label: '评分 4: 回答正确, 需要花费很大力气才能回忆起来' },
        { grade: 4, label: '评分 5: 回答正确, 需要经过一番犹豫才做出反应' },
        { grade: 5, label: '评分 6: 回答正确, 完美响应' },
    ];
    for (const { grade, label } of grades) {
        new Setting(settingsContainer)
            .setName(label)
            .addButton(btn => {
                btn.setButtonText(String(grade+1));
                btn.buttonEl.setAttribute('data-grade', String(grade+1));
                btn.onClick(() => this.rateCard(grade, cardContainer));
            });
    }
}

// 评分逻辑
export async function rateCard(this: MainView, grade: SuperMemoGrade, cardContainer: HTMLDivElement) {
    if (this.isRating || !this.currentLearingCard) return;
    this.isRating = true;
    await this.plugin.updateCard(this.currentLearingCard, grade, this.page);
    this.currentLearingCard = this.pickNextLCard();
    this.renderCard(cardContainer);
    this.isRating = false;
}

// 数字键评分
export function registerRatingKeyEvents(this: MainView, learningContainer: HTMLDivElement, cardContainer: HTMLDivElement) {
    const handleKeydown = async (event: KeyboardEvent) => {
        if (event.key >= '1' && event.key <= '6') {
			if (this.isRating || !this.currentLearingCard) return;
            this.isRating = true;
            this.currentRatingKey = event.key;
            const btn = learningContainer.querySelector(`button[data-grade="${event.key}"]`);
            if (btn) btn.classList.add('active');
            const grade = parseInt(event.key)-1 as SuperMemoGrade;
            await this.plugin.updateCard(this.currentLearingCard, grade, this.page);
        }
    };
    const handleKeyup = async (event: KeyboardEvent) => {
        if (
            this.isRating &&
            this.currentRatingKey !== null &&
            event.key === this.currentRatingKey
        ) {
            const btn = learningContainer.querySelector(`button[data-grade="${event.key}"]`);
            if (btn) btn.classList.remove('active');
            this.isRating = false;
            this.currentRatingKey = null;
            this.currentLearingCard = this.pickNextLCard();
            this.renderCard(cardContainer);
        }
    };
    this.plugin.registerDomEvent(learningContainer, 'keydown', handleKeydown);
    this.plugin.registerDomEvent(learningContainer, 'keyup', handleKeyup);
}

// 答案渲染逻辑
export function registerRenderKeyEvents(this: MainView, learningContainer: HTMLDivElement, cardContainer: HTMLDivElement) {
    let isShowingMarkdown = false;
    const showMarkdown = async () => {
		if (isShowingMarkdown || !this.currentLearingCard) return;
        const file = this.plugin.app.vault.getFileByPath(this.currentLearingCard.path);
        if (file instanceof TFile) {
            const markdownContent = await this.plugin.app.vault.cachedRead(file);
            cardContainer.empty();
            const markdownRenderContainer = cardContainer.createDiv({ cls: 'openwords-card-markdown' });
            await MarkdownRenderer.render(
                this.plugin.app,
                markdownContent,
                markdownRenderContainer,
                file.path,
                this.component
            );
            isShowingMarkdown = true;
        } else {
            new Notice('无法加载单词的 Markdown 文件！');
        }
    };
    const showWord = () => {
        if (!isShowingMarkdown) return;
        this.renderCard(cardContainer);
        isShowingMarkdown = false;
    };
    
    // 延迟1秒后注册鼠标事件
    setTimeout(() => {
        cardContainer.addEventListener('mouseenter', showMarkdown);
        cardContainer.addEventListener('mouseleave', showWord);
    }, 1000);

    const handleKeyDown = async (event: KeyboardEvent) => {
        if (event.key === 'Tab') {
            event.preventDefault();
            await showMarkdown();
        }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
        if (event.key === 'Tab') {
            event.preventDefault();
            showWord();
        }
    };
    this.plugin.registerDomEvent(learningContainer, 'keydown', handleKeyDown);
    this.plugin.registerDomEvent(learningContainer, 'keyup', handleKeyUp);

}

