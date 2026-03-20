import OpenWords from "../main";
import { Notice, TFile, TFolder, Vault } from "obsidian";
import { asArray } from "../utils/converters";
import { writeFile } from "../utils/process";


// 生成单词索引 .base 文件
export async function generateIndex(plugin: OpenWords) {
    const notice = new Notice('索引中...', 0);

    // 从设置读取标签并转换为配置对象（将多级标签的 '/' 替换为 '.'）
    const levelConfigs = plugin.settings.enabledTags.map(tag => {
        const name = tag.replace(/\//g, '.');
        return { tag, name };
    });

    const wordsDir = plugin.settings.folderPath;
    const indexDir = plugin.settings.indexPath;

    // 创建索引文件夹
    const existingIndexFolder = plugin.app.vault.getFolderByPath(indexDir);
    if (!existingIndexFolder) {
        await plugin.app.vault.createFolder(indexDir);
    }

    // 统计每个级别的单词数
    const levelWordCounts: Record<string, number> = {};
    for (const level of levelConfigs) {
        levelWordCounts[level.tag] = 0;
    }

    const folder = plugin.app.vault.getAbstractFileByPath(wordsDir);
    if (!(folder instanceof TFolder) || wordsDir === "/") {
        notice.setMessage('指定的单词文件夹不存在！');
        setTimeout(() => notice.hide(), 2000);
        return
    };

    Vault.recurseChildren(folder, (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;

        const frontMatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!frontMatter) return;

        const tags: string[] = asArray(frontMatter.tags);
        for (const level of levelConfigs) {
            if (tags.includes(level.tag)) {
                levelWordCounts[level.tag] = (levelWordCounts[level.tag] ?? 0) + 1;
            }
        }
    });

    // 总单词数
    const totalCount = plugin.allCards.size;

    // 生成主索引文件
    const mainIndexPath = `${indexDir}/英语单词索引.md`;
    notice.setMessage('索引中... 生成主索引');

    // 构建表格
    const titleRow = '| [[英语单词索引.总计.base#总计\\|总计]] | ' + levelConfigs.map(l => `[[英语单词索引.${l.name}.base#${l.name.split('.').pop()}\\|${l.name.split('.').pop()}]]`).join(' | ') + ' |';
    const separator = '| :---: | ' + levelConfigs.map(() => ':---:').join(' | ') + ' |';
    const countRow = '| ' + totalCount + ' | ' + levelConfigs.map(l => levelWordCounts[l.tag] || 0).join(' | ') + ' |';

    // 字母行
    const letterRows: string[] = [];
    for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i);
        const cells = [`[[英语单词索引.总计.base#总计.${letter}\\|${letter}]]`];
        for (const level of levelConfigs) {
            cells.push(`[[英语单词索引.${level.name}.base#${level.name.split('.').pop()}.${letter}\\|${letter}]]`);
        }
        letterRows.push('| ' + cells.join(' | ') + ' |');
    }

    // 合并表格
    const mainContent = [
        titleRow,
        separator,
        countRow,
        ...letterRows
    ].join('\n');

    await writeFile(plugin.app, mainIndexPath, '##### 英语单词索引\n\n' + mainContent + '\n\n');

    // 生成总计 .base 配置文件（总计列）
    notice.setMessage('索引中... 生成总计索引');
    const allBasePath = `${indexDir}/英语单词索引.总计.base`;
    const allBaseContent = `filters:
  and:
    - file.folder.startsWith("${wordsDir}")
views:
  - type: table
    name: 总计
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日
${Array.from({ length: 26 }, (_, i) => {
        const letter = String.fromCharCode(65 + i);
        return `  - type: table
    name: 总计.${letter}
    filters:
      and:
        - file.basename.startsWith("${letter.toLowerCase()}")
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日`;
    }).join('\n')}
`;
    await writeFile(plugin.app, allBasePath, allBaseContent);

    // 生成每个级别的 .base 配置文件
    for (const level of levelConfigs) {
        notice.setMessage(`索引中... ${level.name}`);
        const basePath = `${indexDir}/英语单词索引.${level.name}.base`;

        const baseContent = `filters:
  and:
    - file.folder.startsWith("${wordsDir}")
    - file.tags.contains("${level.tag}")
views:
  - type: table
    name: ${level.name.split('.').pop()}
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日
${Array.from({ length: 26 }, (_, i) => {
            const letter = String.fromCharCode(65 + i);
            return `  - type: table
    name: ${level.name.split('.').pop()}.${letter}
    filters:
      and:
        - file.basename.startsWith("${letter.toLowerCase()}")
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日`;
        }).join('\n')}
`;

        await writeFile(plugin.app, basePath, baseContent);
    }

    notice.setMessage('索引生成完成！');
    setTimeout(() => notice.hide(), 2000);
}

// 创建英语单词状态 .base 文件
export async function createWordStatusBaseFile(plugin: OpenWords) {
    const wordsDir = plugin.settings.folderPath;
    const indexDir = plugin.settings.indexPath;
    const enabledTagsList = plugin.settings.enabledTags;

    // 创建索引文件夹
    const existingIndexFolder = plugin.app.vault.getFolderByPath(indexDir);
    if (!existingIndexFolder) {
        await plugin.app.vault.createFolder(indexDir);
    }

    // 构建 enabledTags 的 or 条件
    const tagFilters = enabledTagsList.map(tag => `            - file.tags.contains("${tag}")`).join('\n');

    // 构建 .base 文件内容
    const baseContent = `filters:
  and:
    - file.folder.startsWith("${wordsDir}")
views:
  - type: table
    name: 总计
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日
  - type: table
    name: 待学习
    filters:
      and:
        - or:
${tagFilters}
        - and:
            - 掌握 == false
        - and:
            - 重复次数 == 0
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日
  - type: table
    name: 待复习
    filters:
      and:
        - or:
${tagFilters}
        - and:
            - 掌握 == false
        - and:
            - 重复次数 != 0
        - and:
            - 到期日 > today()
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日
  - type: table
    name: 今日到期
    filters:
      and:
        - or:
${tagFilters}
        - and:
            - 掌握 == false
        - and:
            - 重复次数 != 0
        - and:
            - 到期日 <= today()
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日
  - type: table
    name: 已掌握
    filters:
      and:
        - and:
            - 掌握 == true
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日
  - type: table
    name: 未启用
    filters:
      or:
        - not:
${tagFilters}
        - and:
            - 掌握 == true
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日
`;

    // 写入或更新 .base 文件
    const basePath = `${plugin.settings.indexPath}/英语单词状态.base`;
    await writeFile(plugin.app, basePath, baseContent);
}

