import { App, Modal, MarkdownRenderer, TFile, Component, Notice } from 'obsidian';
import { CardInfo } from '../card';
import OpenWords from '../main';


// 默写单词模态框
export class SpellingModal extends Modal {
    plugin: OpenWords;
    component: Component;
    currentCard: CardInfo | null = null;
    hasPeeked: boolean = false; // 是否看过答案
    errorCount: number = 0;     // 本轮错误次数

    constructor(app: App, plugin: OpenWords) {
        super(app);
        this.plugin = plugin;
		this.component = new Component();
    }

    async onOpen() {
		// 加载组件
        const { contentEl } = this;
        contentEl.empty();
        this.component.load()
        this.modalEl.addClass('openwords-spelling'); // 添加样式类

        const title = contentEl.createDiv({ cls: 'openwords-spelling-title', text: '默写单词' });
        const wordMeaningContainer = contentEl.createDiv({ cls: 'openwords-spelling-meaning' });
        const inputContainer = contentEl.createDiv({ cls: 'openwords-spelling-input' });
        const feedbackContainer = contentEl.createDiv({ cls: 'openwords-spelling-feedback' });

        // 初始化第一个单词
        await this.pickNextCard(wordMeaningContainer, inputContainer, feedbackContainer);

        const handleKeydown = (event: KeyboardEvent) => {
            if (event.key === 'Tab') {
                event.preventDefault(); // 阻止页面滚动
                if (this.currentCard) {
                    title.setText(`${this.currentCard.front}`); // 显示答案
                    this.hasPeeked = true; // 标记已看答案
                }
            }
        };

        const handleKeyup = (event: KeyboardEvent) => {
            if (event.key === 'Tab') {
                event.preventDefault(); // 阻止页面滚动
                title.setText('默写单词'); // 恢复标题
            }
        };
        this.plugin.registerDomEvent(contentEl, 'keydown', handleKeydown);
        this.plugin.registerDomEvent(contentEl, 'keyup', handleKeyup);
    }

    async pickNextCard(
        wordMeaningContainer: HTMLElement,
        inputContainer: HTMLElement,
        feedbackContainer: HTMLElement
    ) {
        const cards = Array.from(this.plugin.dueCards.values());
        if (cards.length === 0) {
            feedbackContainer.setText('没有更多单词了！');
            return;
        }
        this.hasPeeked = false;
        this.errorCount = 0;

		// 从易记因子最低的50%中随机选择一个单词
		const sorted = cards.slice().sort((a, b) => a.efactor - b.efactor);
		const half = Math.ceil(sorted.length / 2);
		const pool = sorted.slice(0, half);
		this.currentCard = pool[Math.floor(Math.random() * pool.length)];

        // 渲染单词的词义
        const file = this.plugin.app.vault.getFileByPath(this.currentCard.path);
        if (file instanceof TFile) {
            const content = await this.plugin.app.vault.cachedRead(file);
            const match = content.match(/##### 词义\n(?:- .*\n?)*/g);
            wordMeaningContainer.empty(); // 清空之前的内容
            if (match) {
                await MarkdownRenderer.render(
                    this.app,
                    match[0],
                    wordMeaningContainer,
                    file.path,
                    this.component
                );
            } else {
                wordMeaningContainer.setText('未找到词义');
            }
        }

        // 清空输入容器并生成字母输入框
        inputContainer.empty();
        feedbackContainer.setText('');
        if (this.currentCard) {
            const word = this.currentCard.front;
            const inputFields: HTMLInputElement[] = [];

            // 为每个字母生成一个输入框
            for (let i = 0; i < word.length; i++) {
                const inputField = inputContainer.createEl('input', {
                    type: 'text',
                    cls: 'openwords-spelling-letter',
                });

                inputFields.push(inputField);

                // 自动跳转到下一个输入框
                inputField.addEventListener('input', () => {
                    if (inputField.value.length === 1 && i < word.length - 1) {
                        inputFields[i + 1].focus();
                    }
                    this.checkSpelling(inputFields, word, feedbackContainer, wordMeaningContainer, inputContainer);
                });

                // 支持使用退格键返回上一个输入框
                inputField.addEventListener('keydown', (event) => {
                    if (event.key === 'Backspace' && inputField.value === '' && i > 0) {
                        inputFields[i - 1].focus();
                    }
                });
            }

            // 聚焦第一个输入框
            inputFields[0].focus();
        }
    }

    async checkSpelling(
        inputFields: HTMLInputElement[],
        word: string,
        feedbackContainer: HTMLElement,
        wordMeaningContainer: HTMLElement,
        inputContainer: HTMLElement
    ) {
        const userInput = inputFields.map((field) => field.value).join('');
        if (userInput.length === word.length) {
            if (userInput.toLowerCase() === word.toLowerCase()) {
                feedbackContainer.setText('正确！');
                if (this.currentCard) {
                    let efactor = this.currentCard.efactor;
                    if (this.hasPeeked) {
                        efactor -= 0.02;
                    } else if (this.errorCount === 0) {
                        efactor += 0.15;
                    } else {
                        efactor += 0.05;
                    }
                    if (efactor < 1.3) efactor = 1.3;
                    this.currentCard.efactor = efactor;

                    // 同步到 frontmatter
                    const file = this.plugin.app.vault.getFileByPath(this.currentCard.path);
                    if (file instanceof TFile) {
                        await this.plugin.app.fileManager.processFrontMatter(file, (frontMatter) => {
                            frontMatter["易记因子"] = Math.round(efactor * 100);
                        });
                    }

                    new Notice(`${this.currentCard.front} \n易记因子: ${efactor.toFixed(2)} \n重复次数: ${this.currentCard.repetition} \n间隔: ${this.currentCard.interval} \n到期日: ${this.currentCard.dueDate}`);

                }
                setTimeout(async () => {
                    await this.pickNextCard(wordMeaningContainer, inputContainer, feedbackContainer);
                }, 500);
            } else {
                feedbackContainer.setText('错误，请重试！');
                this.errorCount += 1;
                inputFields.forEach((field) => (field.value = '')); // 清空所有输入框
                inputFields[0].focus(); // 聚焦第一个输入框
            }
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        this.component.unload();
    }
}
