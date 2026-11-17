        function escapeHtml(s) {
            return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }

        function markdownToHtml(markdown) {
            if (!markdown) return '';

            let html = markdown;

            // First, extract code blocks before escaping HTML
            // Use very flexible regex to capture all code block formats
            const codeBlocks = [];
            html = html.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (match, language, code) => {
                // The language label is user content too (it is taken BEFORE the global escaping
                // below), so it must be escaped here — otherwise "```<img onerror=…>" runs script.
                const lang = escapeHtml((language || '').trim() || 'text');
                const placeholder = `\n__CODE_BLOCK_${codeBlocks.length}__\n`;

                // Remove trailing newline if present
                const cleanCode = code.replace(/\n$/, '');

                // Escape HTML in code for safe display
                const escapedCode = cleanCode
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');

                // Create simple code block with language label
                const codeBlock = `<div style="margin: 1rem 0;"><div style="background: #1a1a1a; color: #888; padding: 0.25rem 0.5rem; border-radius: 6px 6px 0 0; font-size: 0.75rem; font-family: 'Consolas', 'Monaco', monospace;">${lang}</div><pre style="margin: 0; border-radius: 0 0 6px 6px;"><code>${escapedCode}</code></pre></div>`;
                codeBlocks.push(codeBlock);
                return placeholder;
            });

            // Escape HTML tags in remaining text (after extracting code blocks)
            html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            // Convert **Bold subsections** with colon (e.g., **Résultat**:)
            html = html.replace(/\*\*([^*]+)\*\*:/g, '<strong style="color: var(--primary); display: block; margin-top: 1rem; margin-bottom: 0.5rem;">$1:</strong>');

            // Convert **Bold** (remaining)
            html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

            // Convert *Italic*
            html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

            // Convert `inline code`
            html = html.replace(/`([^`]+)`/g, '<code style="background: #2d2d2d; color: #f8f8f2; padding: 0.125rem 0.35rem; border-radius: 3px; font-family: \'Consolas\', \'Monaco\', monospace; font-size: 0.9em;">$1</code>');

            // Convert links [text](url) — validate URL scheme to block javascript:/data: (XSS)
            html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, url) => {
                // The text was HTML-escaped above; undo that for the URL (it is escaped once below),
                // otherwise "?a=1&b=2" would become "&amp;amp;" and break query strings / mailto.
                const u = url.trim().replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
                // http(s), mailto, in-page anchors and site-relative paths only. "//host/..." is
                // refused: from a file:// page it would become a network (UNC) path.
                // Browsers treat "\" like "/" and drop tabs/newlines inside URLs, so "/\host" or
                // "/<TAB>/host" would become "//host": any whitespace, control character or
                // backslash makes the link unsafe.
                let safe = !/[\u0000-\u0020\u007f\\]/.test(u) && /^(https?:|mailto:|#|\/(?!\/))/i.test(u) ? u : '#';
                // A path must stay on the page's own host (defence in depth against "//host" tricks).
                if (safe.startsWith('/')) {
                    try { if (new URL(safe, location.href).host !== location.host) safe = '#'; } catch (e) { safe = '#'; }
                }
                return `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline;">${text}</a>`;
            });

            // Convert bullet lists and paragraphs
            const lines = html.split('\n');
            let inList = false;
            let result = [];

            for (let line of lines) {
                // Check if it's a code block placeholder - preserve it exactly
                if (line.trim() === '' || line.trim().match(/^__CODE_BLOCK_\d+__$/)) {
                    if (inList) {
                        result.push('</ul>');
                        inList = false;
                    }
                    if (line.trim().startsWith('__CODE_BLOCK_')) {
                        result.push(line.trim());
                    } else if (line.trim() === '') {
                        // Empty line - add spacing only if not in list
                        if (!inList) {
                            result.push('');
                        }
                    }
                    continue;
                }

                if (line.trim().startsWith('- ')) {
                    if (!inList) {
                        result.push('<ul style="margin: 0.5rem 0; padding-left: 1.5rem;">');
                        inList = true;
                    }
                    result.push('<li>' + line.trim().substring(2) + '</li>');
                } else {
                    if (inList) {
                        result.push('</ul>');
                        inList = false;
                    }
                    if (line.trim()) {
                        result.push('<p style="margin: 0.5rem 0;">' + line + '</p>');
                    }
                }
            }

            if (inList) {
                result.push('</ul>');
            }

            html = result.join('\n');

            // Replace code block placeholders with actual code blocks
            codeBlocks.forEach((block, index) => {
                html = html.replace(`__CODE_BLOCK_${index}__`, block);
            });

            return html;
        }

        // Auto-save function
