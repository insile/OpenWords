import { MarkdownRenderer, Notice, TFile } from "obsidian";
import { OpenWordsView } from "./main-view";
import { CardInfo } from "../utils/card-info";

export class SpellingPage {
    view: OpenWordsView;
    currentSpellingCard: CardInfo | null = null;
    selectedLetter: string | null = null;
    selectedLevel: string | null = null;
    hasPeeked = false;
    errorCount = 0;

    constructor(view: OpenWordsView) {
        this.view = view;
        this.view.viewContainer.empty();
    }

    async render() {
        this.currentSpellingCard = await this.pickNextSCard();
        if (!this.currentSpellingCard) return;

        this.view.viewContainer.empty();
        const spellingContainer = this.view.viewContainer.createDiv({ cls: 'openwords-spelling-container' });
        const backBtn = spellingContainer.createEl('button', { cls: 'openwords-back-btn' });
        const wordMeaningContainer = spellingContainer.createDiv({ cls: 'openwords-spelling-meaning' });
        const title = spellingContainer.createDiv({ cls: 'openwords-spelling-title', text: '=' });
        const inputContainer = spellingContainer.createDiv({ cls: 'openwords-spelling-input' });
        const feedbackContainer = spellingContainer.createDiv({ cls: 'openwords-spelling-feedback' });

        backBtn.textContent = '返回';
        backBtn.onclick = async () => {
            this.view.page = 'home';
            await this.view.render();
        };

        // ESC 快捷键返回
        spellingContainer.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                backBtn.click();
            }
        });

        await this.renderInput(wordMeaningContainer, inputContainer, feedbackContainer);

        // Tab键显示答案
        const handleKeydown = (event: KeyboardEvent) => {
            if (event.key === 'Tab') {
                event.preventDefault();
                if (this.currentSpellingCard) {
                    title.setText(`${this.currentSpellingCard.front}`);
                    this.hasPeeked = true;
                }
            }
        };
        const handleKeyup = (event: KeyboardEvent) => {
            if (event.key === 'Tab') {
                event.preventDefault();
                title.setText('=');
            }
        };
        this.view.plugin.registerDomEvent(spellingContainer, 'keydown', handleKeydown);
        this.view.plugin.registerDomEvent(spellingContainer, 'keyup', handleKeyup);
    }

    async pickNextSCard() {
        // 从易记因子最低的50%中随机选择一个单词
        this.hasPeeked = false;
        this.errorCount = 0;

        const cards = Array.from(this.view.plugin.dueCards.values());
        if (cards.length === 0) {
            new Notice("已完成所有单词！");
            this.view.page = 'home';
            await this.view.render();
            return null;
        }
        const sorted = cards.slice().sort((a, b) => a.efactor - b.efactor);
        const half = Math.ceil(sorted.length / 2);
        const pool = sorted.slice(0, half);
        return pool[Math.floor(Math.random() * pool.length)] ?? null;
    }

    async renderInput( 
        wordMeaningContainer: HTMLElement, 
        inputContainer: HTMLElement, 
        feedbackContainer: HTMLElement 
    ) {
        // 渲染单词的词义
        if (!this.currentSpellingCard) { return }

        const file = this.view.plugin.app.vault.getFileByPath(this.currentSpellingCard.path);
        if (file instanceof TFile) {
            const content = await this.view.plugin.app.vault.cachedRead(file);
            const match = content.match(/##### 词义\n(?:- .*\n?)*/g);
            wordMeaningContainer.empty();
            if (match) {
                await MarkdownRenderer.render(
                    this.view.plugin.app,
                    match[0],
                    wordMeaningContainer,
                    file.path,
                    this.view.component
                );
            } else {
                wordMeaningContainer.setText('未找到词义');
            }
        }

        // 清空输入容器并生成字母输入框
        inputContainer.empty();
        feedbackContainer.setText('');
        if (this.currentSpellingCard) {
            const word = this.currentSpellingCard.front;
            const inputFields: HTMLInputElement[] = [];

            for (let i = 0; i < word.length; i++) {
                const inputField = inputContainer.createEl('input', {
                    type: 'text',
                    cls: 'openwords-spelling-letter',
                });

                inputFields.push(inputField);

                inputField.addEventListener('input', () => {
                    if (inputField.value.length === 1 && i < word.length - 1) {
                        inputFields[i + 1]?.focus();
                    }
                    void this.checkSpelling(inputFields, word, feedbackContainer, wordMeaningContainer, inputContainer);
                });

                inputField.addEventListener('keydown', (event) => {
                    if (event.key === 'Backspace' && inputField.value === '' && i > 0) {
                        inputFields[i - 1]?.focus();
                    }
                });
            }

            inputFields[0]?.focus();
        }
    }

    async checkSpelling(
        inputFields: HTMLInputElement[],
        word: string,
        feedbackContainer: HTMLElement,
        wordMeaningContainer: HTMLElement,
        inputContainer: HTMLElement,
    ) {
        const userInput = inputFields.map((field) => field.value).join('');
        if (userInput.length === word.length) {
            if (userInput.toLowerCase() === word.toLowerCase()) {
                feedbackContainer.setText('正确！');

                if (!this.view.plugin.dueCards.has(word)) {
                    new Notice("当前单词不属于本模式范围, 评分无效并跳过");
                    await new Promise(resolve => setTimeout(resolve, 500));
                    this.currentSpellingCard = await this.pickNextSCard();
                    if (!this.currentSpellingCard) return;
                    await this.renderInput(wordMeaningContainer, inputContainer, feedbackContainer);
                    return
                }

                if (this.currentSpellingCard) {
                    let efactor = this.currentSpellingCard.efactor;
                    if (this.hasPeeked) {
                        efactor -= 0.02;
                    } else if (this.errorCount === 0) {
                        efactor += 0.15;
                    } else {
                        efactor += 0.05;
                    }
                    if (efactor < 1.3) efactor = 1.3;
                    this.currentSpellingCard.efactor = efactor;

                    // 同步到 frontmatter
                    const file = this.view.plugin.app.vault.getFileByPath(this.currentSpellingCard.path);
                    if (file instanceof TFile) {
                        await this.view.plugin.app.fileManager.processFrontMatter(file, (frontMatter: Record<string, unknown>) => {
                            frontMatter["易记因子"] = Math.round(efactor * 100);
                        });
                    }

                    new Notice(`${this.currentSpellingCard.front} \n易记因子: ${efactor.toFixed(2)} \n重复次数: ${this.currentSpellingCard.repetition} \n间隔: ${this.currentSpellingCard.interval} \n到期日: ${this.currentSpellingCard.dueDate}`);
                }
                await new Promise(resolve => setTimeout(resolve, 500));
                this.currentSpellingCard = await this.pickNextSCard();
                if (!this.currentSpellingCard) return;
                await this.renderInput(wordMeaningContainer, inputContainer, feedbackContainer);
            } else {
                feedbackContainer.setText('错误，请重试！');
                this.errorCount += 1;
                inputFields.forEach((field) => (field.value = ''));
                inputFields[0]?.focus();
            }
        }
    }

}