import OpenWords from "../main";
import { Notice, TFile } from "obsidian";
import supermemo, { SuperMemoGrade } from "supermemo";
import { CardInfo } from "../utils/card-info";
import { asArray, asDateString, asNumber } from "../utils/converters";
import { updateStatusBar } from "../utils/process";
import { OPENWORDS_VIEW, PageType } from "../views/main-view";


// 扫描所有单词文件
export async function scanAllNotes(plugin: OpenWords) {
    plugin.allCards.clear();
    plugin.masterCards.clear();
    plugin.enabledCards.clear();
    plugin.newCards.clear();
    plugin.dueCards.clear();
    const normalized = plugin.settings.folderPath.endsWith("/")
        ? plugin.settings.folderPath
        : plugin.settings.folderPath + "/";
    const files = plugin.app.vault.getMarkdownFiles();
    const filteredFiles = files.filter(file => file.path.startsWith(normalized));

    if (filteredFiles.length === 0) {
        new Notice('指定的文件夹下没有 Markdown 文件！');
        updateStatusBar(plugin.app, OPENWORDS_VIEW);
        return;
    }

    await Promise.all(filteredFiles.map(async (file) => {
        await loadWordMetadata(plugin, file, false);
    }));
}

// 加载单词元数据
export async function loadWordMetadata(plugin: OpenWords, file: TFile, single = true) {
    const allCards = plugin.allCards;
    const masterCards = plugin.masterCards;
    const enabledCards = plugin.enabledCards;
    const newCards = plugin.newCards;
    const dueCards = plugin.dueCards;

    // 先删除旧的单词元数据
    masterCards.delete(file.basename);
    enabledCards.delete(file.basename);
    newCards.delete(file.basename);
    dueCards.delete(file.basename);

    // 从 metadataCache 获取文件的 FrontMatter
    const fileCache = plugin.app.metadataCache.getFileCache(file);
    const frontMatter = fileCache?.frontmatter;

    // 如果文件没有 FrontMatter，直接返回
    if (!frontMatter) {
        allCards.delete(file.basename);
        if (single) { updateStatusBar(plugin.app, OPENWORDS_VIEW); }
        return;
    }

    // 解析 FrontMatter 中的单词属性
    const tags: string[] = asArray(frontMatter.tags);
    const isMastered = frontMatter["掌握"] === true;
    const isTagged = tags.some(tag => plugin.settings.enabledTags.includes(tag));

    const card: CardInfo = {
        front: file.basename,
        path: file.path,
        dueDate: asDateString(frontMatter["到期日"]),
        interval: asNumber(frontMatter["间隔"], 0),
        efactor: asNumber(frontMatter["易记因子"], 250) * 0.01,
        repetition: asNumber(frontMatter["重复次数"], 0),
        isMastered: isMastered,
    };

    // 更新所有单词
    allCards.set(card.front, card);

    // 更新掌握单词
    if (isMastered) {
        masterCards.set(card.front, card);
    }

    // 更新启用单词, 新单词, 旧单词
    if (isTagged && !isMastered) {
        enabledCards.set(card.front, card);
        if (frontMatter["重复次数"] === 0) {
            newCards.set(card.front, card);
        } else {
            dueCards.set(card.front, card);
        }
    }

    // 如果是单个文件更新状态栏
    if (single) { updateStatusBar(plugin.app, OPENWORDS_VIEW); }
}

// 更新单词元数据
export async function updateCard(plugin: OpenWords, card: CardInfo, grade: SuperMemoGrade, mode: PageType) {
    if (
        (mode === 'new' && !plugin.newCards.has(card.front)) ||
        (mode === 'old' && !plugin.dueCards.has(card.front))
    ) {
        new Notice(`${card.front} \n不属于本模式范围 \n评分无效并跳过`);
        return;
    }

    const result = supermemo(card, grade);
    const newDate = window.moment().add(result.interval, 'day').format('YYYY-MM-DD');
    const file = plugin.app.vault.getFileByPath(card.path);

    if (!file) {
        new Notice(`文件 ${card.path} 不存在！`);
        return;
    }

    await plugin.app.fileManager.processFrontMatter(file, (frontMatter: Record<string, unknown>) => {
        frontMatter["到期日"] = newDate;
        frontMatter["间隔"] = result.interval;
        frontMatter["易记因子"] = Math.round(result.efactor * 100);
        frontMatter["重复次数"] = result.repetition;
    });

    // 等待元数据缓存更新（最多等待 1 秒）
    let attempts = 0;
    while (attempts < 10) {
        if (mode === 'new') {
            if (grade >= 3 && plugin.dueCards.has(card.front)) {
                break; // 以移出新单词池
            } else if (grade < 3 && (Math.abs(asNumber(plugin.newCards.get(card.front)?.efactor) - result.efactor) < 0.01)) {
                break;
            }
        }
        else {
            if (grade < 3 && plugin.newCards.has(card.front)) {
                break; // 以移出旧单词池
            } else if (grade >= 3 && (Math.abs(asNumber(plugin.dueCards.get(card.front)?.efactor) - result.efactor) < 0.01)) {
                break;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    
    new Notice(`${card.front} \n易记因子: ${result.efactor.toFixed(2)} \n重复次数: ${result.repetition} \n间隔: ${result.interval} \n到期日: ${newDate}`);
}

// 重置单词属性
export async function resetCard(plugin: OpenWords) {
    if (plugin.enabledCards.size === 0) {
        new Notice("没有单词需要重置！");
        return;
    }

    // // 注销监听器，避免重置过程中触发大量缓存更新事件
    // this.unregisterFileWatchers();

    const notice = new Notice('重置中...', 0); // 创建一个持续显示的 Notice
    let count = 0; // 计数器
    const cardList = Array.from(plugin.enabledCards.values()); // 将 Map 转换为数组
    const total = cardList.length;
    const concurrency = 10; // 并发处理数量
    const todayDate = window.moment().format('YYYY-MM-DD'); // 提前计算日期，避免重复计算
    let updateFrequency = Math.max(1, Math.floor(total / 50)); // 减少更新频率到 2%

    // 创建并发处理任务
    const processTasks = async () => {
        for (let i = 0; i < cardList.length; i += concurrency) {
            const chunk = cardList.slice(i, i + concurrency);
            await Promise.all(chunk.map(async (card) => {
                const file = plugin.app.vault.getFileByPath(card.path);
                if (file) {
                    await plugin.app.fileManager.processFrontMatter(file, (frontMatter: Record<string, unknown>) => {
                        frontMatter["到期日"] = todayDate;
                        frontMatter["间隔"] = 0;
                        frontMatter["易记因子"] = 250;
                        frontMatter["重复次数"] = 0;
                    });
                }
                count++;
                // 定期更新 Notice，减少 UI 更新频率
                if (count % updateFrequency === 0 || count === total) {
                    notice.setMessage(`重置中... ${count}/${total}`);
                }
            }));
        }
    };

    try {
        await processTasks();
        notice.setMessage(`重置完成！共 ${count} 个单词`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        new Notice(`重置出错: ${message}`);
        console.error('Reset card error:', error);
    } finally {
        // // 重新注册监听器
        // plugin.registerFileWatchers();
        // // 重新扫描所有单词文件，确保数据同步
        // await this.scanAllNotes();
        // this.updateStatusBar();
        setTimeout(() => notice.hide(), 2000); // 2 秒后自动隐藏 Notice
    }
}


