import OpenWords from "main";
import { MarkdownView, Notice } from "obsidian";


// 建立单词双链
export async function addDoubleBrackets(plugin: OpenWords) {
    const unmasteredWords = new Set(Array.from(plugin.enabledCards.values())
        .filter(card => card.efactor <= plugin.settings.maxEfactorForLink) // 只选择易记因子小于等于设置值的单词
        .map(card => card.front)
    );

    const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
        const editor = activeView.editor;
        const doc = editor.getDoc();
        const content = doc.getValue(); // 获取当前文档内容
        const words = content.split(/(\[\[.+?\]\]|\s+|\b)/); // 将文本拆分成单词, 保留双链、空格和分隔符
        const updatedWords = words.map((word) => {
            const doubleBracketMatch = word.match(/^\[\[(.+?)(\|(.+?))?\]\]$/); // 检查是否是双链格式 [[名称|别名]]
            if (doubleBracketMatch) { // 如果是双链格式
                const innerWord = doubleBracketMatch[1]; // 获取双链中的名称
                const alias = doubleBracketMatch[3]; // 获取双链中的别名
                // 如果双链中的名称不在单词表中，去除双链，保留别名或名称
                if (innerWord && !unmasteredWords.has(innerWord)) {
                    return alias; // 如果有别名，保留别名；否则保留名称
                }
                // 如果双链中的名称在单词表中，保持原样
                return word;

            } else { // 如果不是双链格式
                const doc = plugin.tagger.tagSentence(word.toLowerCase());
                const lemma = doc[0]?.lemma ?? word.toLowerCase(); // 获取动词的原形
                // 检查词干是否在单词表中
                if (unmasteredWords.has(lemma)) {
                    return `[[${lemma}|${word}]]`; // 如果匹配到单词表中的词干，添加双链
                }
                if (unmasteredWords.has(word)) {
                    return `[[${word}|${word}]]`; // 如果匹配到单词表中的词干，添加双链
                }
                return word; // 否则返回原始单词
            }
        });
        const updatedContent = updatedWords.join('');

        doc.setValue(updatedContent); // 用更新后的内容替换原文
        new Notice('已添加双链！');
    }
}

// 自动为选中单词添加双链
export async function autoDoubleLinkWord(plugin: OpenWords) {
    const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
        new Notice("请在 Markdown 编辑器中使用此命令");
        return;
    }
    const editor = activeView.editor;
    const selection = editor.getSelection().trim();
    if (!selection) {
        new Notice("请先选中一个单词");
        return;
    }
    const word = plugin.tagger.tagSentence(selection.toLowerCase())[0];
    const lemma = word?.lemma ?? selection.toLowerCase();
    if (plugin.allCards.has(lemma)) {
        if (lemma !== selection) {
            editor.replaceSelection(`[[${lemma}|${selection}]]`);
        } else {
            editor.replaceSelection(`[[${selection}]]`);
        }
        new Notice(`已成功链接到: ${selection}`);
    } else {
        // 4. 如果文件不存在，可以提示或提供创建选项
        new Notice(`单词库中未找到 "${selection}"`);
    }
}