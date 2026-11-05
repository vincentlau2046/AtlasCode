/**
 * K5 活桥定因探针（bun preload，加载期补丁——零触碰产品文件）：
 * 给 worktree attachments.ts 的 @-mention 链注入 console.error 痕迹，
 * 输出落 TUI stderr → pty.log.stderr / debug log [stderr] 行。
 */
Bun.plugin({
  name: 'k5spy',
  setup(build) {
    build.onLoad({ filter: /\/tui\/utils\/attachments\.(ts|js)$/ }, async (args) => {
      let src = await Bun.file(args.path).text()
      const orig = src
      // 1. processAtMentionedFiles 入口：input + 提取结果
      src = src.replace(
        'async function processAtMentionedFiles(\n  input: string,\n  toolUseContext: ToolUseContext,\n): Promise<Attachment[]> {\n  const files = extractAtMentionedFiles(input)\n  if (files.length === 0) return []',
        `async function processAtMentionedFiles(
  input: string,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  const files = extractAtMentionedFiles(input)
  console.error('[K5SPY] atmention input=' + JSON.stringify(input).slice(0, 100) + ' files=' + JSON.stringify(files))
  if (files.length === 0) return []`,
      )
      // 2. map 内：绝对路径 + deny 判定
      src = src.replace(
        '        const { filename, lineStart, lineEnd } = parseAtMentionedFileLines(file)\n        const absoluteFilename = expandPath(filename)',
        `        const { filename, lineStart, lineEnd } = parseAtMentionedFileLines(file)
        const absoluteFilename = expandPath(filename)
        console.error('[K5SPY] file=' + filename + ' abs=' + absoluteFilename + ' denied=' + isFileReadDenied(absoluteFilename, appState.toolPermissionContext))`,
      )
      // 3. generateFileAttachment 入口/出口
      src = src.replace(
        "  const { offset, limit } = options ?? {}\n\n  // Check if file has a deny rule configured",
        `  const { offset, limit } = options ?? {}
  console.error('[K5SPY] generateFileAttachment filename=' + filename + ' mode=' + mode)

  // Check if file has a deny rule configured`,
      )
      // 4. tryGetPDFReference 入口/结果
      src = src.replace(
        '  const ext = parse(filename).ext.toLowerCase()\n  if (!isPDFExtension(ext)) {\n    return null\n  }',
        `  const ext = parse(filename).ext.toLowerCase()
  console.error('[K5SPY] tryGetPDFReference filename=' + filename + ' ext=' + ext)
  if (!isPDFExtension(ext)) {
    return null
  }`,
      )
      src = src.replace(
        '    return {\n      type: \'pdf_reference\',\n      filename,\n      pageCount,\n      fileSize: stats.size,\n      displayPath: relative(getCwd(), filename),\n    }',
        `    console.error('[K5SPY] tryGetPDFReference OK pages=' + pageCount + ' size=' + stats.size)
    return {
      type: 'pdf_reference',
      filename,
      pageCount,
      fileSize: stats.size,
      displayPath: relative(getCwd(), filename),
    }`,
      )
      src = src.replace(
        '  } catch {\n    // If we can\'t stat the file, return null to proceed with normal reading\n  }\n  return null\n}',
        `  } catch (e) {
    console.error('[K5SPY] tryGetPDFReference THROW ' + (e && (e as Error).message))
    // If we can't stat the file, return null to proceed with normal reading
  }
  console.error('[K5SPY] tryGetPDFReference NULL')
  return null
}`,
      )
      if (src === orig) {
        console.error('[K5SPY] WARN: no patch applied — source shape mismatch')
      } else {
        console.error('[K5SPY] preload patches applied to ' + args.path)
      }
      return {
        contents: src,
        loader: 'ts',
        path: args.path,
      }
    })
    // messages.ts：API 归一化入口的 attachment 面探针
    build.onLoad({ filter: /\/tui\/utils\/messages\.(ts|js)$/ }, async (args) => {
      let src = await Bun.file(args.path).text()
      const orig = src
      src = src.replace(
        "        case 'attachment': {\n          const rawAttachmentMessage = normalizeAttachmentForAPI(\n            message.attachment,\n          )",
        `        case 'attachment': {
          console.error('[K5SPY] api-attachment type=' + JSON.stringify((message.attachment as any).type))
          const rawAttachmentMessage = normalizeAttachmentForAPI(
            message.attachment,
          )
          console.error('[K5SPY] api-attachment normalized msgs=' + rawAttachmentMessage.length + ' first=' + JSON.stringify(rawAttachmentMessage[0] as any).slice(0, 200))`,
      )
      if (src === orig) {
        console.error('[K5SPY] WARN: messages.ts patch not applied')
      }
      return {
        contents: src,
        loader: 'ts',
        path: args.path,
      }
    })
  },
})
