        // ===== TRANSLATION SYSTEM =====
        let currentLanguage = 'en'; // Default language

        const translations = {
            en: {
                // Page title
                'page.title': 'Markdown Task Manager',

                // Header
                'header.title': '📋 Task Manager',
                'header.renameProject': 'Rename project',
                'header.deleteProject': 'Remove project from list',
                'header.folder': '📁 Folder',
                'header.newTask': '➕ Task',
                'header.archives': '📦 Archives',
                'header.columns': '⚙️ Columns',

                // Filters
                'filters.tags': 'Tags:',
                'filters.category': 'Category:',
                'filters.user': 'User:',
                'filters.priority': 'Priority:',
                'filters.select': 'Select...',
                'filters.add': '+',
                'filters.clearAll': '✕ Clear all',
                'filters.search': 'Search in tasks...',
                'filters.searchClear': '✕',

                // Welcome screen
                'welcome.title': 'Welcome! 👋',
                'welcome.description': 'Select the folder containing your Markdown files (kanban.md and archive.md)',
                'welcome.start': '📁 Get Started',
                'welcome.howItWorks': '💡 How does it work?',
                'welcome.step1': 'Click "Get Started" above',
                'welcome.step2': 'Select the folder containing your Markdown files',
                'welcome.step3': 'The app automatically loads kanban.md',
                'welcome.step4': 'Manage your tasks visually with Kanban',
                'welcome.step5': 'Changes are saved to Markdown files',
                'welcome.browserWarning': '⚠️ Supported browsers: Chrome 86+, Edge 86+, Opera 72+',

                // Task detail modal
                'taskDetail.title': 'Task Details',
                'taskDetail.close': 'Close',
                'taskDetail.delete': '🗑️ Delete',
                'taskDetail.archive': '📦 Archive',
                'taskDetail.edit': '✏️ Edit',

                // Task form modal
                'taskForm.newTask': 'New Task',
                'taskForm.editTask': 'Edit Task',
                'taskForm.titleLabel': 'Title *',
                'taskForm.columnLabel': 'Column *',
                'taskForm.priorityLabel': 'Priority',
                'taskForm.priorityNone': 'None',
                'taskForm.priorityCritical': 'Critical',
                'taskForm.priorityHigh': 'High',
                'taskForm.priorityMedium': 'Medium',
                'taskForm.priorityLow': 'Low',
                'taskForm.categoryLabel': 'Category',
                'taskForm.categoryPlaceholder': 'Frontend, Backend...',
                'taskForm.assignedLabel': 'Assigned to',
                'taskForm.assignedPlaceholder': '@alice',
                'taskForm.createdLabel': 'Created',
                'taskForm.startedLabel': 'Started',
                'taskForm.dueLabel': 'Due',
                'taskForm.completedLabel': 'Completed',
                'taskForm.tagsLabel': 'Tags',
                'taskForm.tagsPlaceholder': '#bug #feature',
                'taskForm.tagsHelp': 'Separate with spaces',
                'taskForm.descriptionLabel': 'Description',
                'taskForm.subtasksLabel': 'Subtasks',
                'taskForm.subtaskPlaceholder': 'Add a subtask...',
                'taskForm.subtaskAdd': '+ Add',
                'taskForm.notesLabel': 'Notes',
                'taskForm.notesPlaceholder': 'Technical notes, results, decisions, etc...',
                'taskForm.notesHelp': 'Markdown supported: **bold**, *italic*, `code`, lists, links, **Subsections**:',
                'taskForm.cancel': 'Cancel',
                'taskForm.create': 'Create',
                'taskForm.save': 'Save',
                'taskForm.keptDates': 'These dates are not written as YYYY-MM-DD, so the date fields cannot show them. They are kept as written unless you enter a new date: {dates}',

                // Columns modal
                'columns.title': 'Manage Columns',
                'columns.add': '+ Add Column',

                // Archives modal
                'archives.title': '📦 Archives',
                'archives.search': 'Search in archives...',
                'archives.empty': 'No archived tasks',

                // Project selector
                'projects.select': 'Select a project...',

                // Task metadata in detail modal
                'meta.priority': 'Priority',
                'meta.status': 'Status',
                'meta.category': 'Category',
                'meta.assigned': 'Assigned to',
                'meta.created': 'Creation date',
                'meta.started': 'Start date',
                'meta.due': 'Due date',
                'meta.completed': 'Completion date',
                'meta.tags': 'Tags',
                'meta.description': 'Description',
                'meta.subtasks': 'Subtasks ({completed}/{total})',
                'meta.notes': 'Notes',

                // Empty states
                'empty.noTasks': 'No tasks',

                // Buttons and actions
                'action.restore': '↩️ Restore',
                'action.delete': '🗑️',
                'action.edit': '✏️',
                'action.moveUp': 'Move up',
                'action.moveDown': 'Move down',

                // Tooltips
                'tooltip.filterByCategory': 'Filter by this category',
                'tooltip.filterByUser': 'Filter by this user',
                'tooltip.filterByTag': 'Filter by this tag',
                'tooltip.filterByPriority': 'Filter by this priority',
                'tooltip.doubleClickEdit': 'Double-click to edit',
                'tooltip.delete': 'Delete',
                'tooltip.overdue': 'Overdue',
                'tooltip.dueSoon': 'Due soon',

                // Notifications
                'notif.folderLoaded': 'Folder loaded successfully!',
                'notif.folderError': 'Error loading folder',
                'notif.initializingFolder': 'Initializing folder...',
                'notif.filesInitialized': 'Files initialized successfully! (kanban.md and archive.md)',
                'notif.filesError': 'Error creating files',
                'notif.projectLoaded': 'Project "{name}" loaded',
                'notif.permissionDenied': 'Permission denied for this project',
                'notif.projectError': 'Error switching project',
                'notif.projectRenamed': 'Project renamed successfully',
                'notif.projectDeleted': 'Project removed from list',
                'notif.renameError': 'Error renaming',
                'notif.projectRestored': 'Project restored automatically',
                'notif.taskMoved': 'Task moved!',
                'notif.taskEdited': 'Task {id} updated!',
                'notif.taskCreated': 'Task {id} created!',
                'notif.taskArchived': 'Task archived!',
                'notif.taskDeleted': 'Task permanently deleted',
                'notif.taskRestored': 'Task restored to its original column!',

                // Prompts and confirmations
                'prompt.projectName': 'Project name (leave empty to use "{name}"):',
                'prompt.renameProject': 'New project name:',
                'prompt.columnName': 'Column name:',
                'prompt.columnId': 'Column ID (e.g., todo, done):',
                'prompt.editSubtask': 'Edit subtask:',
                'confirm.deleteColumn': 'Delete this column?',
                'confirm.deleteSubtask': 'Delete this subtask?',
                'confirm.deleteProject': 'Remove project "{name}" from the recent list?\n\nThis only removes it from the dropdown - your files will not be deleted.',
                'confirm.archiveTask': 'Archive task "{title}"?',
                'confirm.deleteTask': '⚠️ WARNING: Permanently delete task "{title}"?\n\nThis action cannot be undone.',
                'confirm.deleteTaskFromArchive': '⚠️ WARNING: Permanently delete task "{title}"?\n\nThis action cannot be undone.\n\nIf you want to keep it in history, use "Archive" instead.',

                // Alerts
                'alert.browserNotSupported': 'Your browser does not support the File System Access API.\n\nPlease use Chrome 86+, Edge 86+ or Opera 72+.',

                // Subtasks in detail modal
                'subtask.newPlaceholder': 'New subtask...',

                // Markdown generation
                'markdown.archiveTitle': '# Task Archive',
                'markdown.archiveDesc': '> Archived tasks',
                'markdown.archiveSection': '## ✅ Archives',
                'markdown.configSection': '## ⚙️ Configuration',
                'markdown.configColumns': '**Columns**:',
                'markdown.configCategories': '**Categories**:',
                'markdown.configUsers': '**Users**:',
                'markdown.configPriorities': '**Priorities**:',
                'markdown.configTags': '**Tags**:',

                // Safe save / sync (fork additions)
                'header.reload': 'Reload from disk / check for external changes',
                'header.languageLabel': 'Language',
                'header.projectLabel': 'Project',
                'header.themeToggle': 'Toggle dark mode',
                'header.buildInfo': 'Build {version} (source {hash})',
                'modal.close': 'Close',
                'filters.removeFilter': 'Remove this filter',
                'filters.searchClearLabel': 'Clear search',
                'archives.noMatch': 'No archived task matches the search',
                'columns.nameLabel': 'Column name (display)',
                'columns.idLabel': 'ID',
                'columns.idHelp': 'Column id stored in **Status** (changing it moves the tasks of this column)',
                'tooltip.deletePermanently': 'Delete permanently',
                'tooltip.unknownStatus': 'This **Status** matches no column. Move the task to a column to fix it.',
                'board.unknownStatus': 'Unknown status: {status}',
                'notif.loadError': 'Could not read kanban.md (permission or read error). Nothing was changed.',
                'notif.readOnly': 'kanban.md is read-only in this app until the reported problem is fixed in the file.',
                'notif.conflictNoEdit': 'Saving is stopped because of a conflict. Export your changes or reload from disk first.',
                'notif.busy': 'Another operation is still running. Please wait.',
                'notif.reloaded': 'Reloaded from disk',
                'notif.reloadedExternal': 'Changes made outside this page were loaded',
                'notif.noExternalChange': 'No external changes on disk',
                'notif.saved': 'Saved',
                'notif.archiveUnreadable': 'archive.md could not be read. Archive and restore are disabled until it can be read (reload).',
                'notif.archiveReadOnly': 'archive.md contains content this app cannot keep. Archive and restore are disabled.',
                'notif.duplicateDifferent': '{id} already exists in {file} with different content. Nothing was changed — please check both copies.',
                'notif.archiveFailed': '{id} could not be written to archive.md. It stays on the board.',
                'notif.archivePartial': '{id} was saved to archive.md, but kanban.md could not be updated: the task is now in BOTH files. Run "Archive" again (no duplicate is created) or reload and check.',
                'notif.changedDuringOperation': '{id} changed while it was being archived. It was saved to archive.md in its previous state and is still on the board — check both copies.',
                'notif.staleList': 'The list was out of date and has been refreshed. Please try again.',
                'notif.archiveNeededForId': 'archive.md cannot be read, so a new unique task id cannot be chosen. Reload when it is readable again (existing tasks can still be edited).',
                'notif.trailingRuleDropped': '(The "---" at the end of the description / notes was not saved: the file cannot keep it there, also not as a heading underline.)',
                'notif.archiveNotUtf8ForId': 'archive.md is not UTF-8 text, so the task ids in it cannot be read reliably and a new unique task id cannot be chosen. Save archive.md again as UTF-8 and reload (existing tasks can still be edited).',
                'notif.historyError': 'The folder is open, but the recent-projects list could not be updated.',
                'notif.restoreFailed': '{id} could not be written to kanban.md. It stays in the archive.',
                'notif.restorePartial': '{id} was added to kanban.md, but archive.md could not be updated: the task is now in BOTH files. Run "Restore" again (no duplicate is created) or reload and check.',
                'confirm.reloadDiscard': 'Reload from disk?\n\nYour unsaved changes in this page will be DISCARDED.\nUse "Download unsaved" or "Copy" first if you need them.',
                'confirm.initFolder': 'The folder "{name}" has no kanban.md.\n\nCreate a new board (kanban.md and archive.md) in this folder?\n\nCancel if you picked the wrong folder (e.g. the folder that only contains task-manager.html).',
                'confirm.initEmptyKanban': 'kanban.md in "{name}" is EMPTY.\n\nInitialise it as a new board?\n\nCancel if the file may have been damaged — check the OneDrive version history first.',
                'confirm.leaveUnsaved': 'This project has unsaved changes (or a conflict).\n\nLeave it and discard them?\nCancel to stay and export them first.',
                'alert.forbiddenHeading': 'This line would be read back as something else and was not saved:\n\n{line}\n\nNot allowed: "### TASK-…" lines, "## …" headings (outside code blocks), code blocks that are not closed; in the description also lines starting with **Status**:, **Priority**:, **Tags**:, **Subtasks**, **Notes** etc. (outside code blocks).',
                'alert.invalidColumnId': 'Invalid column id: it must be non-empty, unique and must not contain | ( or ).',
                'alert.lastColumn': 'The last column cannot be deleted.',
                'alert.columnNotEmpty': 'This column still contains {count} task(s). Move them to another column first.',
                'sync.bannerLabel': 'Save status',
                'sync.saveFailedShort': 'Not saved: {file}',
                'sync.downloaded': 'Downloaded {name}',
                'sync.copied': 'Unsaved board copied to the clipboard',
                'sync.copyFailed': 'Copy failed — use "Download unsaved" instead',
                'sync.statusReadOnly': '🔒 Read-only',
                'sync.statusConflict': '⚠️ Conflict',
                'sync.statusSaving': '⏳ Saving…',
                'sync.statusError': '❌ Not saved',
                'sync.statusUnsaved': '● Unsaved',
                'sync.statusSaved': '✓ Saved',
                'sync.blockedKanban': 'kanban.md contains content that this app would lose on save. Saving is disabled for this file. Fix the file (by hand or with your AI assistant), then reload.',
                'sync.blockedArchive': 'archive.md cannot be used safely (see below). Archive and restore are disabled until it is fixed and reloaded.',
                'sync.conflict.conflict': '{file} was changed outside this page since it was loaded. Automatic saving is stopped so the other change is not overwritten.',
                'sync.conflict.missing': '{file} is missing on disk (deleted, moved or not synced). Nothing was written.',
                'sync.conflict.appeared': '{file} was created by another program since it was loaded. Nothing was written.',
                'sync.conflict.uncertain': 'The result of writing {file} could not be confirmed. Check the file and reload.',
                'sync.conflictHelp': 'Your changes are still in this page. Download or copy them if you need them, then "Reload from disk" (this discards the page\'s unsaved changes) and re-apply what is missing.',
                'sync.error.read-failed': '{file} could not be read (permission or access error). Nothing was written.',
                'sync.error.write-failed': 'Writing {file} failed. The file on disk was not changed.',
                'sync.error.verify-failed': '{file} did not contain the expected content after saving.',
                'sync.error.blocked': '{file} is read-only in this app.',
                'sync.errorUnsavedHelp': 'Your changes are kept in this page. Retry, or download / copy them.',
                'sync.retry': '🔁 Retry',
                'sync.download': '⬇️ Download unsaved',
                'sync.copy': '📋 Copy',
                'sync.reload': '🔄 Reload from disk',
                'integrity.lossy-task': '{id}: these lines would be lost on save:',
                'integrity.malformed-task-header': 'Malformed task header(s) (expected "### TASK-123 | Title"):',
                'integrity.unknown-header-content': 'Unknown lines in the header/configuration part:',
                'integrity.text-outside-task': 'Text outside any task{where}:',
                'integrity.task-not-in-column': 'Task(s) in a section that is not a configured column:',
                'integrity.unknown-section': 'Section "{section}" is not a configured column:',
                'integrity.read-failed': 'archive.md could not be read.',
                'integrity.heading-in-tasks': '"## " heading(s) in the task area (they would become part of a task):',
                'integrity.unstable-task': '{id}: saving would not read back identically.',
                'integrity.unstable-header': 'The configuration part would not read back identically after saving.',
                'integrity.unclosed-code-block': '{id}: a ``` / ~~~ code block is not closed inside this task (a "### TASK-" line in it would become a separate task):',
                'integrity.subtasks-in-notes': '"**Subtasks**:" written after "**Notes**:" is kept as note text, not as a checklist:',
                'integrity.duplicate-id': 'Duplicate task id(s): {ids}',
                'integrity.unknown-status': 'Task(s) with a **Status** that matches no column (shown in the first column):',
                'integrity.non-iso-date': 'Date(s) not written as YYYY-MM-DD (kept as written, but the task form cannot show them; write them as YYYY-MM-DD):',
                'integrity.task-read-twice': 'Task block(s) that were read more than once or do not match their "### TASK-" line:',
                'integrity.not-utf8': 'This file is not UTF-8 text (for example Shift_JIS or UTF-16 written by Windows PowerShell 5.1, or Notepad "ANSI"). It is shown as read, but never written: save it again as UTF-8 and reload.',
                'alert.titleRequired': 'Please enter a title.',
                'alert.pipeNotAllowed': '"{field}" cannot contain "|": it separates the fields in kanban.md and the rest would be lost. Use "/" or "・" instead.',
                'alert.cannotWriteTask': 'This task was NOT saved: written to kanban.md it would not read back as entered (the board would become read-only).\n\n{details}',
                'notif.conflictKeptInMemory': 'Not saved because of the conflict: the change is kept in this page only. Use "Download unsaved" or "Copy", then reload from disk.',
                'confirm.discardForm': 'Discard what you typed in this form?',
                'locale.dates': 'en-US',

                // Language selector
                'language.label': 'Language:',
                'language.en': 'English',
                'language.fr': 'Français',
                'language.de': 'Deutsch',
                'language.zh_cn': '简体中文',
                'language.ja': '日本語'
            },
            fr: {
                // Page title
                'page.title': 'Gestionnaire de Tâches Markdown',

                // Header
                'header.title': '📋 Task Manager',
                'header.renameProject': 'Renommer le projet',
                'header.deleteProject': 'Retirer le projet de la liste',
                'header.folder': '📁 Dossier',
                'header.newTask': '➕ Tâche',
                'header.archives': '📦 Archives',
                'header.columns': '⚙️ Colonnes',

                // Filters
                'filters.tags': 'Tags:',
                'filters.category': 'Catégorie:',
                'filters.user': 'Utilisateur:',
                'filters.priority': 'Priorité:',
                'filters.select': 'Sélectionner...',
                'filters.add': '+',
                'filters.clearAll': '✕ Tout effacer',
                'filters.search': 'Rechercher dans les tâches...',
                'filters.searchClear': '✕',

                // Welcome screen
                'welcome.title': 'Bienvenue ! 👋',
                'welcome.description': 'Sélectionnez le dossier contenant vos fichiers Markdown (kanban.md et archive.md)',
                'welcome.start': '📁 Commencer',
                'welcome.howItWorks': '💡 Comment ça marche ?',
                'welcome.step1': 'Cliquez sur "Commencer" ci-dessus',
                'welcome.step2': 'Sélectionnez le dossier contenant vos fichiers Markdown',
                'welcome.step3': 'L\'application charge automatiquement kanban.md',
                'welcome.step4': 'Gérez vos tâches visuellement avec le Kanban',
                'welcome.step5': 'Les modifications sont sauvegardées dans les fichiers Markdown',
                'welcome.browserWarning': '⚠️ Navigateurs supportés : Chrome 86+, Edge 86+, Opera 72+',

                // Task detail modal
                'taskDetail.title': 'Détails de la tâche',
                'taskDetail.close': 'Fermer',
                'taskDetail.delete': '🗑️ Supprimer',
                'taskDetail.archive': '📦 Archiver',
                'taskDetail.edit': '✏️ Modifier',

                // Task form modal
                'taskForm.newTask': 'Nouvelle tâche',
                'taskForm.editTask': 'Modifier la tâche',
                'taskForm.titleLabel': 'Titre *',
                'taskForm.columnLabel': 'Colonne *',
                'taskForm.priorityLabel': 'Priorité',
                'taskForm.priorityNone': 'Aucune',
                'taskForm.priorityCritical': 'Critique',
                'taskForm.priorityHigh': 'Haute',
                'taskForm.priorityMedium': 'Moyenne',
                'taskForm.priorityLow': 'Basse',
                'taskForm.categoryLabel': 'Catégorie',
                'taskForm.categoryPlaceholder': 'Frontend, Backend...',
                'taskForm.assignedLabel': 'Assigné à',
                'taskForm.assignedPlaceholder': '@alice',
                'taskForm.createdLabel': 'Créé',
                'taskForm.startedLabel': 'Commencé',
                'taskForm.dueLabel': 'Échéance',
                'taskForm.completedLabel': 'Terminé',
                'taskForm.tagsLabel': 'Tags',
                'taskForm.tagsPlaceholder': '#bug #feature',
                'taskForm.tagsHelp': 'Séparez avec des espaces',
                'taskForm.descriptionLabel': 'Description',
                'taskForm.subtasksLabel': 'Sous-tâches',
                'taskForm.subtaskPlaceholder': 'Ajouter une sous-tâche...',
                'taskForm.subtaskAdd': '+ Ajouter',
                'taskForm.notesLabel': 'Notes',
                'taskForm.notesPlaceholder': 'Notes techniques, résultats, décisions, etc...',
                'taskForm.notesHelp': 'Markdown supporté : **gras**, *italique*, `code`, listes, liens, **Sous-sections**:',
                'taskForm.cancel': 'Annuler',
                'taskForm.create': 'Créer',
                'taskForm.save': 'Enregistrer',

                // Columns modal
                'columns.title': 'Gérer les colonnes',
                'columns.add': '+ Ajouter une colonne',

                // Archives modal
                'archives.title': '📦 Archives',
                'archives.search': 'Rechercher dans les archives...',
                'archives.empty': 'Aucune tâche archivée',

                // Project selector
                'projects.select': 'Sélectionner un projet...',

                // Task metadata in detail modal
                'meta.priority': 'Priorité',
                'meta.status': 'Statut',
                'meta.category': 'Catégorie',
                'meta.assigned': 'Assigné à',
                'meta.created': 'Date de création',
                'meta.started': 'Date de début',
                'meta.due': 'Date d\'échéance',
                'meta.completed': 'Date de fin',
                'meta.tags': 'Tags',
                'meta.description': 'Description',
                'meta.subtasks': 'Sous-tâches ({completed}/{total})',
                'meta.notes': 'Notes',

                // Empty states
                'empty.noTasks': 'Aucune tâche',

                // Buttons and actions
                'action.restore': '↩️ Restaurer',
                'action.delete': '🗑️',
                'action.edit': '✏️',
                'action.moveUp': 'Déplacer vers le haut',
                'action.moveDown': 'Déplacer vers le bas',

                // Tooltips
                'tooltip.filterByCategory': 'Filtrer par cette catégorie',
                'tooltip.filterByUser': 'Filtrer par cet utilisateur',
                'tooltip.filterByTag': 'Filtrer par ce tag',
                'tooltip.filterByPriority': 'Filtrer par cette priorité',
                'tooltip.doubleClickEdit': 'Double-cliquez pour éditer',
                'tooltip.delete': 'Supprimer',
                'tooltip.overdue': 'En retard',
                'tooltip.dueSoon': 'Bientôt dû',

                // Notifications
                'notif.folderLoaded': 'Dossier chargé avec succès !',
                'notif.folderError': 'Erreur lors de la sélection du dossier',
                'notif.initializingFolder': 'Initialisation du dossier...',
                'notif.filesInitialized': 'Fichiers initialisés avec succès ! (kanban.md et archive.md)',
                'notif.filesError': 'Erreur lors de la création des fichiers',
                'notif.projectLoaded': 'Projet "{name}" chargé',
                'notif.permissionDenied': 'Permission refusée pour ce projet',
                'notif.projectError': 'Erreur lors du changement de projet',
                'notif.projectRenamed': 'Projet renommé avec succès',
                'notif.projectDeleted': 'Projet retiré de la liste',
                'notif.renameError': 'Erreur lors du renommage',
                'notif.projectRestored': 'Projet restauré automatiquement',
                'notif.taskMoved': 'Tâche déplacée !',
                'notif.taskEdited': 'Tâche {id} modifiée !',
                'notif.taskCreated': 'Tâche {id} créée !',
                'notif.taskArchived': 'Tâche archivée !',
                'notif.taskDeleted': 'Tâche supprimée définitivement',
                'notif.taskRestored': 'Tâche restaurée dans sa colonne d\'origine !',

                // Prompts and confirmations
                'prompt.projectName': 'Nom du projet (laisser vide pour utiliser "{name}") :',
                'prompt.renameProject': 'Nouveau nom du projet :',
                'prompt.columnName': 'Nom de la colonne:',
                'prompt.columnId': 'ID de la colonne (ex: todo, done):',
                'prompt.editSubtask': 'Modifier la sous-tâche:',
                'confirm.deleteColumn': 'Supprimer cette colonne ?',
                'confirm.deleteSubtask': 'Supprimer cette sous-tâche ?',
                'confirm.deleteProject': 'Retirer le projet "{name}" de la liste récente ?\n\nCeci retire seulement le projet du menu déroulant - vos fichiers ne seront pas supprimés.',
                'confirm.archiveTask': 'Archiver la tâche "{title}" ?',
                'confirm.deleteTask': '⚠️ ATTENTION : Supprimer définitivement la tâche "{title}" ?\n\nCette action est irréversible.',
                'confirm.deleteTaskFromArchive': '⚠️ ATTENTION : Supprimer définitivement la tâche "{title}" ?\n\nCette action est irréversible.\n\nSi vous voulez la conserver dans l\'historique, utilisez plutôt "Archiver".',

                // Alerts
                'alert.browserNotSupported': 'Votre navigateur ne supporte pas la File System Access API.\n\nVeuillez utiliser Chrome 86+, Edge 86+ ou Opera 72+.',

                // Subtasks in detail modal
                'subtask.newPlaceholder': 'Nouvelle sous-tâche...',

                // Markdown generation
                'markdown.archiveTitle': '# Archive des Tâches',
                'markdown.archiveDesc': '> Tâches archivées',
                'markdown.archiveSection': '## ✅ Archives',
                'markdown.configSection': '## ⚙️ Configuration',
                'markdown.configColumns': '**Colonnes**:',
                'markdown.configCategories': '**Catégories**:',
                'markdown.configUsers': '**Utilisateurs**:',
                'markdown.configPriorities': '**Priorités**:',
                'markdown.configTags': '**Tags**:',

                // Language selector
                'language.label': 'Langue :',
                'language.en': 'English',
                'language.fr': 'Français',
                'language.de': 'Deutsch',
                'language.zh_cn': '简体中文',
                'language.ja': '日本語',
                'locale.dates': 'fr-FR'
            },
            de: {
                // Page title
                'page.title': 'Markdown Task Manager',

                // Header
                'header.title': '📋 Task Manager',
                'header.renameProject': 'Projekt umbenennen',
                'header.deleteProject': 'Projekt aus Liste entfernen',
                'header.folder': '📁 Ordner',
                'header.newTask': '➕ Aufgabe',
                'header.archives': '📦 Archiv',
                'header.columns': '⚙️ Spalten',

                // Filters
                'filters.tags': 'Tags:',
                'filters.category': 'Kategorie:',
                'filters.user': 'Benutzer:',
                'filters.priority': 'Priorität:',
                'filters.select': 'Auswählen...',
                'filters.add': '+',
                'filters.clearAll': '✕ Alles löschen',
                'filters.search': 'In Aufgaben suchen...',
                'filters.searchClear': '✕',

                // Welcome screen
                'welcome.title': 'Willkommen! 👋',
                'welcome.description': 'Wählen Sie den Ordner aus, der die Markdown-Dateien beinhaltet (kanban.md and archive.md)',
                'welcome.start': '📁 Loslegen',
                'welcome.howItWorks': '💡 Wie funktioniert es?',
                'welcome.step1': 'Klicken Sie oben auf "Loslegen"',
                'welcome.step2': 'Wählen Sie den Ordner aus, der die Markdown-Dateien beinhaltet',
                'welcome.step3': 'Die App lädt automatisch kanban.md',
                'welcome.step4': 'Verwalten Sie Ihre Aufgaben grafisch mit Kanban',
                'welcome.step5': 'Änderungen werden als Markdown-Datei gespeichert',
                'welcome.browserWarning': '⚠️ Unterstützte Browser: Chrome 86+, Edge 86+, Opera 72+',

                // Task detail modal
                'taskDetail.title': 'Aufgabendetails',
                'taskDetail.close': 'Schließen',
                'taskDetail.delete': '🗑️ Löschen',
                'taskDetail.archive': '📦 Archivieren',
                'taskDetail.edit': '✏️ Bearbeiten',

                // Task form modal
                'taskForm.newTask': 'Neue Aufgabe',
                'taskForm.editTask': 'Aufgabe bearbeiten',
                'taskForm.titleLabel': 'Titel *',
                'taskForm.columnLabel': 'Spalte *',
                'taskForm.priorityLabel': 'Priorität',
                'taskForm.priorityNone': 'Ohne',
                'taskForm.priorityCritical': 'Kritisch',
                'taskForm.priorityHigh': 'Hoch',
                'taskForm.priorityMedium': 'Mittel',
                'taskForm.priorityLow': 'Niedrig',
                'taskForm.categoryLabel': 'Kategorie',
                'taskForm.categoryPlaceholder': 'Frontend, Backend...',
                'taskForm.assignedLabel': 'Zugewiesen an',
                'taskForm.assignedPlaceholder': '@alice',
                'taskForm.createdLabel': 'Erstellt',
                'taskForm.startedLabel': 'Begonnen',
                'taskForm.dueLabel': 'Fällig',
                'taskForm.completedLabel': 'Abgeschlossen',
                'taskForm.tagsLabel': 'Tags',
                'taskForm.tagsPlaceholder': '#bug #feature',
                'taskForm.tagsHelp': 'Mit Leerzeichen trennen',
                'taskForm.descriptionLabel': 'Beschreibung',
                'taskForm.subtasksLabel': 'Unteraufgaben',
                'taskForm.subtaskPlaceholder': 'Unteraufgabe hinzufügen...',
                'taskForm.subtaskAdd': '+ Hinzufügen',
                'taskForm.notesLabel': 'Anmerkungen',
                'taskForm.notesPlaceholder': 'Technische Anmerkungen, Ergebnisse, Entscheidungen, etc...',
                'taskForm.notesHelp': 'Markdown-Unterstützung: **fett**, *kursiv*, `code`, Listen, Links, **Abschnitte**:',
                'taskForm.cancel': 'Abbrechen',
                'taskForm.create': 'Erstellen',
                'taskForm.save': 'Speichern',

                // Columns modal
                'columns.title': 'Spalten bearbeiten',
                'columns.add': '+ Spalte hinzufügen',

                // Archives modal
                'archives.title': '📦 Archiv',
                'archives.search': 'Suche im Archiv...',
                'archives.empty': 'Keine archivierten Aufgaben',

                // Project selector
                'projects.select': 'Wählen Sie ein Projekt...',

                // Task metadata in detail modal
                'meta.priority': 'Priorität',
                'meta.status': 'Status',
                'meta.category': 'Kategorie',
                'meta.assigned': 'Zugewiesen an',
                'meta.created': 'Erstellungsdatum',
                'meta.started': 'Startdatum',
                'meta.due': 'Fälligkeitsdatum',
                'meta.completed': 'Erledigungsdatum',
                'meta.tags': 'Tags',
                'meta.description': 'Beschreibung',
                'meta.subtasks': 'Unteraufgaben ({completed}/{total})',
                'meta.notes': 'Anmerkungen',

                // Empty states
                'empty.noTasks': 'Keine Aufgaben',

                // Buttons and actions
                'action.restore': '↩️ Wiederherstellen',
                'action.delete': '🗑️',
                'action.edit': '✏️',
                'action.moveUp': 'Nach oben',
                'action.moveDown': 'Nach unten',

                // Tooltips
                'tooltip.filterByCategory': 'Nach dieser Kategorie filtern',
                'tooltip.filterByUser': 'Nach diesem Benutzer filtern',
                'tooltip.filterByTag': 'Nach diesem Tag filtern',
                'tooltip.filterByPriority': 'Nach dieser Priorität filtern',
                'tooltip.doubleClickEdit': 'Doppelklick zum Bearbeiten',
                'tooltip.delete': 'Löschen',
                'tooltip.overdue': 'Überfällig',
                'tooltip.dueSoon': 'Bald fällig',

                // Notifications
                'notif.folderLoaded': 'Ordner erfolgreich geladen!',
                'notif.folderError': 'Problem beim Laden des Ordners',
                'notif.initializingFolder': 'Ordner wird initialisiert...',
                'notif.filesInitialized': 'Dateien erfolgreich initialisiert! (kanban.md and archive.md)',
                'notif.filesError': 'Problem beim Erstellen der Dateien',
                'notif.projectLoaded': 'Projekt "{name}" geladen',
                'notif.permissionDenied': 'Zugriff verweigert für dieses Projekt',
                'notif.projectError': 'Problem beim Wechseln des Projekts',
                'notif.projectRenamed': 'Projekt erfolgreich umbenannt',
                'notif.projectDeleted': 'Projekt aus Liste gelöscht',
                'notif.renameError': 'Problem beim Umbenennen',
                'notif.projectRestored': 'Projekt erfolgreich wiederhergestellt',
                'notif.taskMoved': 'Aufgabe verschoben!',
                'notif.taskEdited': 'Aufgabe {id} aktualisiert!',
                'notif.taskCreated': 'Aufgabe {id} erstellt!',
                'notif.taskArchived': 'Aufgabe archiviert!',
                'notif.taskDeleted': 'Aufgabe endgültig gelöscht',
                'notif.taskRestored': 'Aufgabe in ursprünglicher Spalte zurückgesetzt!',

                // Prompts and confirmations
                'prompt.projectName': 'Projektname (leer lassen, um "{name}" zu verwenden):',
                'prompt.renameProject': 'Neuer Projektname:',
                'prompt.columnName': 'Spaltenname:',
                'prompt.columnId': 'Spalten-ID (z.B., todo, done):',
                'prompt.editSubtask': 'Unteraufgabe bearbeiten:',
                'confirm.deleteColumn': 'Diese Spalte löschen?',
                'confirm.deleteSubtask': 'Diese Unteraufgabe löschen?',
                'confirm.deleteProject': 'Projekt "{name}" aus Liste löschen?\n\nDas Projekt wird nur aus der Liste gelöscht. Die Dateien bleiben bestehen.',
                'confirm.archiveTask': 'Aufgabe "{title}" archivieren?',
                'confirm.deleteTask': '⚠️ WARNUNG: Aufgabe "{title}" endgültig löschen?\n\nDies kann nicht rückgängig gemacht werden.',
                'confirm.deleteTaskFromArchive': '⚠️ WARNUNG: Aufgabe "{title}" endgültig löschen?\n\nDies kann nicht rückgängig gemacht werden.\n\nWenn die Aufgabe in der Historie vorgehalten werden soll, klicken Sie stattdessen auf "Archivieren".',

                // Alerts
                'alert.browserNotSupported': 'Ihr Browser unterstützt die File System Access API nicht.\n\Bitte Chrome 86+, Edge 86+ oder Opera 72+ nutzen.',

                // Subtasks in detail modal
                'subtask.newPlaceholder': 'Neue Unteraufgabe...',

                // Markdown generation
                'markdown.archiveTitle': '# Aufgaben-Archiv',
                'markdown.archiveDesc': '> Archivierte Aufgaben',
                'markdown.archiveSection': '## ✅ Archiv',
                'markdown.configSection': '## ⚙️ Konfiguration',
                'markdown.configColumns': '**Spalten**:',
                'markdown.configCategories': '**Kategorien**:',
                'markdown.configUsers': '**Benutzer**:',
                'markdown.configPriorities': '**Prioritäten**:',
                'markdown.configTags': '**Tags**:',

                // Language selector
                'language.label': 'Sprache:',
                'language.en': 'English',
                'language.fr': 'Français',
                'language.de': 'Deutsch',
                'language.ja': '日本語',
                'locale.dates': 'de-DE'
            },
            zh_cn: {
                // Page title
                'page.title': 'Markdown 任务管理器',

                // Header
                'header.title': '📋 任务管理器',
                'header.renameProject': '重命名项目',
                'header.deleteProject': '从列表中移除项目',
                'header.folder': '📁 文件夹',
                'header.newTask': '➕ 任务',
                'header.archives': '📦 归档',
                'header.columns': '⚙️ 列设置',

                // Filters
                'filters.tags': '标签:',
                'filters.category': '类别:',
                'filters.user': '用户:',
                'filters.priority': '优先级:',
                'filters.select': '选择...',
                'filters.add': '+',
                'filters.clearAll': '✕ 清空全部',
                'filters.search': '在任务中搜索...',
                'filters.searchClear': '✕',

                // Welcome screen
                'welcome.title': '欢迎! 👋',
                'welcome.description': '选择包含您 Markdown 文件的文件夹 (kanban.md 和 archive.md)',
                'welcome.start': '📁 开始使用',
                'welcome.howItWorks': '💡 工作原理?',
                'welcome.step1': '点击上方的"开始使用"',
                'welcome.step2': '选择包含您 Markdown 文件的文件夹',
                'welcome.step3': '应用将自动加载 kanban.md',
                'welcome.step4': '通过看板可视化地管理任务',
                'welcome.step5': '更改将保存到 Markdown 文件中',
                'welcome.browserWarning': '⚠️ 支持的浏览器: Chrome 86+, Edge 86+, Opera 72+',

                // Task detail modal
                'taskDetail.title': '任务详情',
                'taskDetail.close': '关闭',
                'taskDetail.delete': '🗑️ 删除',
                'taskDetail.archive': '📦 归档',
                'taskDetail.edit': '✏️ 编辑',

                // Task form modal
                'taskForm.newTask': '新建任务',
                'taskForm.editTask': '编辑任务',
                'taskForm.titleLabel': '标题 *',
                'taskForm.columnLabel': '列 *',
                'taskForm.priorityLabel': '优先级',
                'taskForm.priorityNone': '无',
                'taskForm.priorityCritical': '紧急',
                'taskForm.priorityHigh': '高',
                'taskForm.priorityMedium': '中',
                'taskForm.priorityLow': '低',
                'taskForm.categoryLabel': '类别',
                'taskForm.categoryPlaceholder': '前端、后端...',
                'taskForm.assignedLabel': '分配给',
                'taskForm.assignedPlaceholder': '@用户名',
                'taskForm.createdLabel': '创建于',
                'taskForm.startedLabel': '开始于',
                'taskForm.dueLabel': '截止于',
                'taskForm.completedLabel': '完成于',
                'taskForm.tagsLabel': '标签',
                'taskForm.tagsPlaceholder': '#bug #feature',
                'taskForm.tagsHelp': '用空格分隔',
                'taskForm.descriptionLabel': '描述',
                'taskForm.subtasksLabel': '子任务',
                'taskForm.subtaskPlaceholder': '添加子任务...',
                'taskForm.subtaskAdd': '+ 添加',
                'taskForm.notesLabel': '备注',
                'taskForm.notesPlaceholder': '技术备注、结果、决策等...',
                'taskForm.notesHelp': 'Markdown 支持: **粗体**, *斜体*, `代码`, 列表, 链接, **子节标题**:',
                'taskForm.cancel': '取消',
                'taskForm.create': '创建',
                'taskForm.save': '保存',

                // Columns modal
                'columns.title': '管理列',
                'columns.add': '+ 添加列',

                // Archives modal
                'archives.title': '📦 归档',
                'archives.search': '在归档中搜索...',
                'archives.empty': '无已归档任务',

                // Project selector
                'projects.select': '选择一个项目...',

                // Task metadata in detail modal
                'meta.priority': '优先级',
                'meta.status': '状态',
                'meta.category': '类别',
                'meta.assigned': '分配给',
                'meta.created': '创建日期',
                'meta.started': '开始日期',
                'meta.due': '截止日期',
                'meta.completed': '完成日期',
                'meta.tags': '标签',
                'meta.description': '描述',
                'meta.subtasks': '子任务 ({completed}/{total})',
                'meta.notes': '备注',

                // Empty states
                'empty.noTasks': '暂无任务',

                // Buttons and actions
                'action.restore': '↩️ 恢复',
                'action.delete': '🗑️',
                'action.edit': '✏️',
                'action.moveUp': '上移',
                'action.moveDown': '下移',

                // Tooltips
                'tooltip.filterByCategory': '按此类别筛选',
                'tooltip.filterByUser': '按此用户筛选',
                'tooltip.filterByTag': '按此标签筛选',
                'tooltip.filterByPriority': '按此优先级筛选',
                'tooltip.doubleClickEdit': '双击编辑',
                'tooltip.delete': '删除',
                'tooltip.overdue': '已逾期',
                'tooltip.dueSoon': '即将到期',

                // Notifications
                'notif.folderLoaded': '文件夹加载成功!',
                'notif.folderError': '加载文件夹时出错',
                'notif.initializingFolder': '正在初始化文件夹...',
                'notif.filesInitialized': '文件初始化成功! (kanban.md 和 archive.md)',
                'notif.filesError': '创建文件时出错',
                'notif.projectLoaded': '项目 "{name}" 已加载',
                'notif.permissionDenied': '无此项目的访问权限',
                'notif.projectError': '切换项目时出错',
                'notif.projectRenamed': '项目重命名成功',
                'notif.projectDeleted': '项目已从列表中移除',
                'notif.renameError': '重命名时出错',
                'notif.projectRestored': '项目已自动恢复',
                'notif.taskMoved': '任务已移动!',
                'notif.taskEdited': '任务 {id} 已更新!',
                'notif.taskCreated': '任务 {id} 已创建!',
                'notif.taskArchived': '任务已归档!',
                'notif.taskDeleted': '任务已永久删除',
                'notif.taskRestored': '任务已恢复至原列!',

                // Prompts and confirmations
                'prompt.projectName': '项目名称 (留空则使用 "{name}"):',
                'prompt.renameProject': '新项目名称:',
                'prompt.columnName': '列名称:',
                'prompt.columnId': '列 ID (例如: todo, done):',
                'prompt.editSubtask': '编辑子任务:',
                'confirm.deleteColumn': '删除此列?',
                'confirm.deleteSubtask': '删除此子任务?',
                'confirm.deleteProject': '从近期列表中移除项目 "{name}" ?\n\n此操作仅会将其从下拉列表中移除, 您的文件不会被删除.',
                'confirm.archiveTask': '归档任务 "{title}"?',
                'confirm.deleteTask': '⚠️ 警告: 永久删除任务 "{title}"?\n\n此操作无法撤销.',
                'confirm.deleteTaskFromArchive': '⚠️ 警告: 永久删除任务 "{title}"?\n\n此操作无法撤销.\n\n若希望保留历史记录, 请改用“归档”功能.',

                // Alerts
                'alert.browserNotSupported': '您的浏览器不支持文件系统访问 API.\n\n请使用 Chrome 86+、 Edge 86+ 或 Opera 72+.',

                // Subtasks in detail modal
                'subtask.newPlaceholder': '新的子任务...',

                // Markdown generation
                'markdown.archiveTitle': '# 任务归档',
                'markdown.archiveDesc': '> 已归档的任务',
                'markdown.archiveSection': '## ✅ 归档',
                'markdown.configSection': '## ⚙️ 配置',
                'markdown.configColumns': '**列**:',
                'markdown.configCategories': '**类别**:',
                'markdown.configUsers': '**用户**:',
                'markdown.configPriorities': '**优先级**:',
                'markdown.configTags': '**标签**:',

                // Language selector
                'language.label': '语言:',
                'language.en': 'English',
                'language.fr': 'Français',
                'language.zh_cn': '简体中文',
                'language.ja': '日本語',
                'locale.dates': 'zh-CN'
            },
            ja: {
                // Page title
                'page.title': 'Markdown タスクマネージャー',

                // Header
                'header.title': '📋 タスクマネージャー',
                'header.renameProject': 'プロジェクト名を変更',
                'header.deleteProject': 'プロジェクトを一覧から外す',
                'header.folder': '📁 フォルダー',
                'header.newTask': '➕ タスク',
                'header.archives': '📦 アーカイブ',
                'header.columns': '⚙️ 列の設定',

                // Filters
                'filters.tags': 'タグ:',
                'filters.category': 'カテゴリ:',
                'filters.user': '担当者:',
                'filters.priority': '優先度:',
                'filters.select': '選択...',
                'filters.add': '+',
                'filters.clearAll': '✕ すべて解除',
                'filters.search': 'タスクを検索（ID・タイトル・説明・メモ・タグなど）...',
                'filters.searchClear': '✕',

                // Welcome screen
                'welcome.title': 'ようこそ 👋',
                'welcome.description': 'Markdown ファイル（kanban.md と archive.md）を置くフォルダーを選択してください',
                'welcome.start': '📁 フォルダーを選択して開始',
                'welcome.howItWorks': '💡 使い方',
                'welcome.step1': '上の「フォルダーを選択して開始」をクリック',
                'welcome.step2': 'タスクデータ用のフォルダー（kanban.md を置く場所）を選択',
                'welcome.step3': 'kanban.md が自動で読み込まれます（なければ新規作成）',
                'welcome.step4': 'カンバンでタスクを操作します',
                'welcome.step5': '変更は Markdown ファイルに保存されます。外部（AI・エディター）の変更は上書きせず、競合として通知します',
                'welcome.browserWarning': '⚠️ 対応ブラウザー: Microsoft Edge 86 以降、Google Chrome 86 以降（Firefox / Safari は非対応）',

                // Task detail modal
                'taskDetail.title': 'タスクの詳細',
                'taskDetail.close': '閉じる',
                'taskDetail.delete': '🗑️ 削除',
                'taskDetail.archive': '📦 アーカイブ',
                'taskDetail.edit': '✏️ 編集',

                // Task form modal
                'taskForm.newTask': '新しいタスク',
                'taskForm.editTask': 'タスクを編集',
                'taskForm.titleLabel': 'タイトル *',
                'taskForm.columnLabel': '列 *',
                'taskForm.priorityLabel': '優先度',
                'taskForm.priorityNone': 'なし',
                'taskForm.priorityCritical': '緊急',
                'taskForm.priorityHigh': '高',
                'taskForm.priorityMedium': '中',
                'taskForm.priorityLow': '低',
                'taskForm.categoryLabel': 'カテゴリ',
                'taskForm.categoryPlaceholder': '開発、調査...',
                'taskForm.assignedLabel': '担当者',
                'taskForm.assignedPlaceholder': '@yamada',
                'taskForm.createdLabel': '作成日',
                'taskForm.startedLabel': '開始日',
                'taskForm.dueLabel': '期限',
                'taskForm.completedLabel': '完了日',
                'taskForm.tagsLabel': 'タグ',
                'taskForm.tagsPlaceholder': '#バグ #改善',
                'taskForm.tagsHelp': 'スペースで区切って入力（# は省略可）',
                'taskForm.descriptionLabel': '説明',
                'taskForm.subtasksLabel': 'サブタスク',
                'taskForm.subtaskPlaceholder': 'サブタスクを追加...',
                'taskForm.subtaskAdd': '+ 追加',
                'taskForm.notesLabel': 'メモ',
                'taskForm.notesPlaceholder': '技術メモ、結果、判断理由など...',
                'taskForm.notesHelp': 'Markdown 対応: **太字**、*斜体*、`コード`、リスト、リンク、**小見出し**:',
                'taskForm.cancel': 'キャンセル',
                'taskForm.create': '作成',
                'taskForm.save': '保存',
                'taskForm.keptDates': '次の日付は YYYY-MM-DD 形式でないため、日付欄に表示できません。新しい日付を入れない限り、書かれたまま保持します: {dates}',

                // Columns modal
                'columns.title': '列の管理',
                'columns.add': '+ 列を追加',

                // Archives modal
                'archives.title': '📦 アーカイブ',
                'archives.search': 'アーカイブを検索（ID・タイトルなど）...',
                'archives.empty': 'アーカイブされたタスクはありません',

                // Project selector
                'projects.select': 'プロジェクトを選択...',

                // Task metadata in detail modal
                'meta.priority': '優先度',
                'meta.status': '状態（列）',
                'meta.category': 'カテゴリ',
                'meta.assigned': '担当者',
                'meta.created': '作成日',
                'meta.started': '開始日',
                'meta.due': '期限',
                'meta.completed': '完了日',
                'meta.tags': 'タグ',
                'meta.description': '説明',
                'meta.subtasks': 'サブタスク（{completed}/{total}）',
                'meta.notes': 'メモ',

                // Empty states
                'empty.noTasks': 'タスクはありません',

                // Buttons and actions
                'action.restore': '↩️ 復元',
                'action.delete': '🗑️',
                'action.edit': '✏️',
                'action.moveUp': '上へ移動',
                'action.moveDown': '下へ移動',

                // Tooltips
                'tooltip.filterByCategory': 'このカテゴリで絞り込む',
                'tooltip.filterByUser': 'この担当者で絞り込む',
                'tooltip.filterByTag': 'このタグで絞り込む',
                'tooltip.filterByPriority': 'この優先度で絞り込む',
                'tooltip.doubleClickEdit': 'ダブルクリックで編集',
                'tooltip.delete': '削除',
                'tooltip.overdue': '期限切れ',
                'tooltip.dueSoon': 'まもなく期限',

                // Notifications
                'notif.folderLoaded': 'フォルダーを読み込みました',
                'notif.folderError': 'フォルダーの読み込みに失敗しました',
                'notif.initializingFolder': 'フォルダーを初期化しています...',
                'notif.filesInitialized': 'kanban.md と archive.md を作成しました',
                'notif.filesError': 'ファイルの作成に失敗しました',
                'notif.projectLoaded': 'プロジェクト「{name}」を読み込みました',
                'notif.permissionDenied': 'このプロジェクトへのアクセスが許可されませんでした',
                'notif.projectError': 'プロジェクトの切り替えに失敗しました',
                'notif.projectRenamed': 'プロジェクト名を変更しました',
                'notif.projectDeleted': 'プロジェクトを一覧から外しました（ファイルは削除していません）',
                'notif.renameError': '名前の変更に失敗しました',
                'notif.projectRestored': '前回のプロジェクトを開きました',
                'notif.taskMoved': 'タスクを移動しました',
                'notif.taskEdited': 'タスク {id} を更新しました',
                'notif.taskCreated': 'タスク {id} を作成しました',
                'notif.taskArchived': 'タスクをアーカイブしました',
                'notif.taskDeleted': 'タスクを完全に削除しました',
                'notif.taskRestored': 'タスクを元の列に復元しました',

                // Prompts and confirmations
                'prompt.projectName': 'プロジェクト名（空欄なら「{name}」）:',
                'prompt.renameProject': '新しいプロジェクト名:',
                'prompt.columnName': '列の表示名（日本語可）:',
                'prompt.columnId': '列の ID（例: todo, done。**Status** に保存される識別子）:',
                'prompt.editSubtask': 'サブタスクを編集:',
                'confirm.deleteColumn': 'この列を削除しますか？',
                'confirm.deleteSubtask': 'このサブタスクを削除しますか？',
                'confirm.deleteProject': 'プロジェクト「{name}」を最近使った一覧から外しますか？\n\n一覧から外すだけで、ファイルは削除されません。',
                'confirm.archiveTask': 'タスク「{title}」をアーカイブしますか？',
                'confirm.deleteTask': '⚠️ 注意: タスク「{title}」を完全に削除しますか？\n\nこの操作は元に戻せません。',
                'confirm.deleteTaskFromArchive': '⚠️ 注意: タスク「{title}」を完全に削除しますか？\n\nこの操作は元に戻せません。\n\n履歴として残す場合は「アーカイブ」を使ってください。',

                // Alerts
                'alert.browserNotSupported': 'このブラウザーは File System Access API に対応していません。\n\nMicrosoft Edge 86 以降、または Google Chrome 86 以降を使ってください。',

                // Subtasks in detail modal
                'subtask.newPlaceholder': '新しいサブタスク...',

                // Markdown generation (only used when a NEW archive.md is created; never re-applied
                // to an existing file, and never used for data keys such as **Status**)
                'markdown.archiveTitle': '# タスクアーカイブ',
                'markdown.archiveDesc': '> アーカイブ済みのタスク',
                'markdown.archiveSection': '## ✅ Archives',
                'markdown.configSection': '## ⚙️ Configuration',
                'markdown.configColumns': '**Columns**:',
                'markdown.configCategories': '**Categories**:',
                'markdown.configUsers': '**Users**:',
                'markdown.configPriorities': '**Priorities**:',
                'markdown.configTags': '**Tags**:',

                // Safe save / sync
                'header.reload': 'ディスクから再読込 / 外部の変更を確認',
                'header.languageLabel': '表示言語',
                'header.projectLabel': 'プロジェクト',
                'header.themeToggle': 'ダークモード切替',
                'header.buildInfo': 'ビルド {version}（ソース {hash}）',
                'modal.close': '閉じる',
                'filters.removeFilter': 'この絞り込みを解除',
                'filters.searchClearLabel': '検索をクリア',
                'archives.noMatch': '検索に一致するアーカイブはありません',
                'columns.nameLabel': '列の表示名',
                'columns.idLabel': 'ID',
                'columns.idHelp': '**Status** に保存される列 ID（変更するとこの列のタスクも新しい ID に移ります）',
                'tooltip.deletePermanently': '完全に削除',
                'tooltip.unknownStatus': 'この **Status** はどの列とも一致しません。列へ移動すると修正されます。',
                'board.unknownStatus': '不明な状態: {status}',
                'notif.loadError': 'kanban.md を読み込めませんでした（権限または読み取りエラー）。ファイルは変更していません。',
                'notif.readOnly': 'kanban.md に問題があるため、修正されるまでこの画面からは保存しません（読み取り専用）。',
                'notif.conflictNoEdit': '競合のため保存を停止中です。先に変更を退避するか、ディスクから再読込してください。',
                'notif.busy': '別の処理を実行中です。完了までお待ちください。',
                'notif.reloaded': 'ディスクから再読込しました',
                'notif.reloadedExternal': '外部で行われた変更を読み込みました',
                'notif.noExternalChange': 'ディスク上の外部変更はありません',
                'notif.saved': '保存しました',
                'notif.archiveUnreadable': 'archive.md を読み込めません。読めるようになるまで（再読込するまで）アーカイブと復元は使えません。',
                'notif.archiveReadOnly': 'archive.md にこの画面で保持できない内容があるため、アーカイブと復元を停止しています。',
                'notif.duplicateDifferent': '{id} は {file} に内容の異なる同じ ID のタスクとして既に存在します。何も変更していません。両方の内容を確認してください。',
                'notif.archiveFailed': '{id} を archive.md に保存できませんでした。タスクはボードに残っています。',
                'notif.archivePartial': '{id} は archive.md に保存しましたが、kanban.md を更新できませんでした。現在このタスクは両方のファイルにあります。もう一度「アーカイブ」を実行する（重複は作られません）か、再読込して確認してください。',
                'notif.changedDuringOperation': '{id} はアーカイブ処理中に変更されました。archive.md には変更前の内容で保存し、ボードにも残しています。両方の内容を確認してください。',
                'notif.staleList': '一覧が古くなっていたため更新しました。もう一度操作してください。',
                'notif.archiveNeededForId': 'archive.md を読めないため、重複しない新しいタスク ID を決められません。読めるようになってから再読込してください（既存タスクの編集はできます）。',
                'notif.trailingRuleDropped': '（説明・メモの末尾の「---」は保存していません。ファイルのその位置には残せないためです。見出しの下線として使った場合も同じです）',
                'notif.archiveNotUtf8ForId': 'archive.md が UTF-8 ではないため、アーカイブ内のタスク ID を確実に読めず、重複しない新しいタスク ID を決められません。archive.md を UTF-8 で保存し直してから再読込してください（既存タスクの編集はできます）。',
                'notif.historyError': 'フォルダーは開きましたが、最近使ったプロジェクトの一覧を更新できませんでした。',
                'notif.restoreFailed': '{id} を kanban.md に保存できませんでした。タスクはアーカイブに残っています。',
                'notif.restorePartial': '{id} は kanban.md に追加しましたが、archive.md を更新できませんでした。現在このタスクは両方のファイルにあります。もう一度「復元」を実行する（重複は作られません）か、再読込して確認してください。',
                'confirm.reloadDiscard': 'ディスクから再読込しますか？\n\nこの画面の未保存の変更は破棄されます。\n必要なら先に「未保存分をダウンロード」か「コピー」で退避してください。',
                'confirm.initFolder': 'フォルダー「{name}」には kanban.md がありません。\n\nこのフォルダーに新しいボード（kanban.md と archive.md）を作成しますか？\n\nフォルダーを間違えた場合（task-manager.html だけを置くアプリ用フォルダーなど）はキャンセルしてください。',
                'confirm.initEmptyKanban': 'フォルダー「{name}」の kanban.md は空です。\n\n新しいボードとして初期化しますか？\n\nファイルが壊れた可能性がある場合はキャンセルし、先に OneDrive のバージョン履歴を確認してください。',
                'confirm.leaveUnsaved': 'このプロジェクトには未保存の変更（または競合）があります。\n\n破棄して移動しますか？\nキャンセルするとこの画面に残り、先に退避できます。',
                'alert.forbiddenHeading': '次の行は読み込み時に別の意味に解釈されるため、保存しませんでした:\n\n{line}\n\n書けない行: 「### TASK-…」の行、「## …」の見出し（コードブロック外）、閉じていないコードブロック。説明欄では「**Status**:」「**Priority**:」「**Tags**:」「**Subtasks**」「**Notes**」などで始まる行も不可（コードブロック外）。',
                'alert.invalidColumnId': '列 ID が不正です。空でなく、他の列と重複せず、| ( ) を含まない値にしてください。',
                'alert.lastColumn': '最後の 1 列は削除できません。',
                'alert.columnNotEmpty': 'この列にはまだ {count} 件のタスクがあります。先に別の列へ移動してください。',
                'sync.bannerLabel': '保存状態',
                'sync.saveFailedShort': '保存されていません: {file}',
                'sync.downloaded': '{name} をダウンロードしました',
                'sync.copied': '未保存のボード内容をクリップボードにコピーしました',
                'sync.copyFailed': 'コピーできませんでした。「未保存分をダウンロード」を使ってください',
                'sync.statusReadOnly': '🔒 読み取り専用',
                'sync.statusConflict': '⚠️ 競合',
                'sync.statusSaving': '⏳ 保存中…',
                'sync.statusError': '❌ 未保存（失敗）',
                'sync.statusUnsaved': '● 未保存',
                'sync.statusSaved': '✓ 保存済み',
                'sync.blockedKanban': 'kanban.md に、この画面で保存すると失われる内容があります。このファイルへの保存を停止しました。ファイルを修正（手作業または AI に依頼）してから再読込してください。',
                'sync.blockedArchive': 'archive.md を安全に扱えません（詳細は下記）。修正して再読込するまで、アーカイブと復元は停止します。',
                'sync.conflict.conflict': '{file} は読み込んだ後に外部（AI・エディター等）で変更されています。その変更を上書きしないよう、自動保存を停止しました。',
                'sync.conflict.missing': '{file} がディスク上に見つかりません（削除・移動・未同期の可能性）。何も書き込んでいません。',
                'sync.conflict.appeared': '{file} は読み込んだ後に別のプログラムで作成されました。何も書き込んでいません。',
                'sync.conflict.uncertain': '{file} の書き込み結果を確認できませんでした。ファイルを確認して再読込してください。',
                'sync.conflictHelp': 'この画面での変更はまだ残っています。必要なら「未保存分をダウンロード」か「コピー」で退避し、「ディスクから再読込」（この画面の未保存分は破棄）してから、足りない変更をやり直してください。',
                'sync.error.read-failed': '{file} を読み取れませんでした（権限またはアクセスのエラー）。何も書き込んでいません。',
                'sync.error.write-failed': '{file} への書き込みに失敗しました。ディスク上のファイルは変更されていません。',
                'sync.error.verify-failed': '保存後の {file} が想定した内容と一致しませんでした。',
                'sync.error.blocked': '{file} はこの画面では読み取り専用です。',
                'sync.errorUnsavedHelp': '変更はこの画面に残っています。再試行するか、ダウンロード / コピーで退避してください。',
                'sync.retry': '🔁 再試行',
                'sync.download': '⬇️ 未保存分をダウンロード',
                'sync.copy': '📋 コピー',
                'sync.reload': '🔄 ディスクから再読込',
                'integrity.lossy-task': '{id}: 保存すると次の行が失われます:',
                'integrity.malformed-task-header': '形式が正しくないタスク見出し（正しくは「### TASK-123 | タイトル」）:',
                'integrity.unknown-header-content': '見出し・設定部分に解釈できない行があります:',
                'integrity.text-outside-task': 'どのタスクにも属さない文章があります{where}:',
                'integrity.task-not-in-column': '設定された列ではないセクションにタスクがあります:',
                'integrity.unknown-section': 'セクション「{section}」は設定された列ではありません:',
                'integrity.read-failed': 'archive.md を読み込めませんでした。',
                'integrity.heading-in-tasks': 'タスク領域に「## 」見出しがあります（直前のタスクの一部として扱われてしまいます）:',
                'integrity.unstable-task': '{id}: 保存すると同じ内容として読み戻せません。',
                'integrity.unstable-header': '設定部分を保存すると同じ内容として読み戻せません。',
                'integrity.unclosed-code-block': '{id}: ``` / ~~~ のコードブロックがこのタスクの中で閉じていません（中の「### TASK-」行が別のタスクになってしまいます）:',
                'integrity.subtasks-in-notes': '「**Notes**:」の後に書かれた「**Subtasks**:」は、チェックリストではなくメモの文章として扱います:',
                'integrity.duplicate-id': '重複したタスク ID があります: {ids}',
                'integrity.unknown-status': 'どの列とも一致しない **Status** のタスクがあります（先頭の列に表示）:',
                'integrity.non-iso-date': 'YYYY-MM-DD 形式でない日付があります（書かれたまま保持しますが、フォームでは表示できません。YYYY-MM-DD に直してください）:',
                'integrity.task-read-twice': '2 回以上読み込まれた、または「### TASK-」行と一致しないタスクがあります:',
                'integrity.not-utf8': 'このファイルは UTF-8 ではありません（Windows PowerShell 5.1 の Set-Content やメモ帳の「ANSI」で保存した Shift_JIS、Out-File やリダイレクト（>）で書いた UTF-16 など）。表示はしますが、書き込みは行いません。UTF-8 で保存し直してから再読込してください。',
                'alert.titleRequired': 'タイトルを入力してください。',
                'alert.pipeNotAllowed': '「{field}」には「|」を使えません（kanban.md の項目の区切りなので、それ以降が失われます）。「/」や「・」を使ってください。',
                'alert.cannotWriteTask': 'このタスクは保存していません。このまま kanban.md に書くと、入力どおりに読み戻せません（ボード全体が読み取り専用になります）。\n\n{details}',
                'notif.conflictKeptInMemory': '競合のため保存していません。変更はこの画面の中だけに残しています。「未保存分をダウンロード」か「コピー」で退避してから、ディスクから再読込してください。',
                'confirm.discardForm': 'このフォームに入力した内容を破棄しますか？',
                'locale.dates': 'ja-JP',

                // Language selector
                'language.label': '言語:',
                'language.en': 'English',
                'language.fr': 'Français',
                'language.de': 'Deutsch',
                'language.zh_cn': '简体中文',
                'language.ja': '日本語'
            }
        };

        const priorityIconClasses = {
          // Color circles
          '🟢': 'Green',
          '🟡': 'Yellow',
          '🟠': 'Orange',
          '🔴': 'Red',
          '🔵': 'Blue',
          '🟣': 'Purple',
          '⚪': 'White',
          '⚫': 'Black',
          // Hearts
          '❤️': 'Red',
          '🧡': 'Orange',
          '💛': 'Yellow',
          '💚': 'Green',
          '💙': 'Blue',
          '💜': 'Purple',
          '🤍': 'White',
          '🖤': 'Black',
          // Squares
          '🟥': 'Red',
          '🟧': 'Orange',
          '🟨': 'Yellow',
          '🟩': 'Green',
          '🟦': 'Blue',
          '🟪': 'Purple',
          // Diamonds
          '🔶': 'Orange',
          '🔷': 'Blue',
          '🔸': 'Orange',
          '🔹': 'Blue',
          // Stars
          '⭐': 'Yellow',
          '🌟': 'Yellow',
          // Flags
          '🚩': 'Red',
          '🏴': 'Black',
          '🏳️': 'White',
          // Alert symbols
          '⚠️': 'Yellow',
          '🔥': 'Orange',
          '💥': 'Red',
          '⚡': 'Yellow',
          // Arrows
          '⬆️': 'Red',
          '➡️': 'Blue',
          '⬇️': 'Green',
          // Exclamation/Question
          '❗': 'Red',
          '❓': 'Blue',
          '❕': 'Red',
          '❔': 'Blue',
        }

        // Translation function
        function t(key, params = {}) {
            let text = translations[currentLanguage]?.[key] || translations['en'][key] || key;

            // Replace parameters in text
            Object.keys(params).forEach(param => {
                text = text.replace(`{${param}}`, params[param]);
            });

            return text;
        }

        // Translate priority default values
        function displayPriority(priority) {
            if (!priority || currentLanguage === 'en') return priority;

            const emoji = getFirstEmoji(priority);
            const text = clean(priority);

            // Map default English priorities to translation keys
            const keyMap = {
                'Critical': 'taskForm.priorityCritical',
                'High': 'taskForm.priorityHigh',
                'Medium': 'taskForm.priorityMedium',
                'Low': 'taskForm.priorityLow'
            };

            // If it's a default priority, translate it
            if (keyMap[text]) {
                const translatedText = t(keyMap[text]);
                return emoji + (emoji ? ' ' : '') + translatedText;
            }

            // Custom priority - return as-is
            return priority;
        }

        // Update all static text elements in the UI
        function updateStaticTexts() {
            // Update page title
            document.title = t('page.title');

            // Update header
            document.getElementById('headerTitle').textContent = t('header.title');
            document.getElementById('renameProjectBtn').title = t('header.renameProject');
            document.getElementById('deleteProjectBtn').title = t('header.deleteProject');
            document.getElementById('selectFolderBtn').innerHTML = t('header.folder');
            document.getElementById('newTaskBtn').innerHTML = t('header.newTask');
            document.getElementById('archiveBtn').innerHTML = t('header.archives');
            document.getElementById('manageColsBtn').innerHTML = t('header.columns');

            // Accessible names / tooltips of icon-only controls
            const setLabel = (id, key) => {
                const el = document.getElementById(id);
                if (el) { el.title = t(key); el.setAttribute('aria-label', t(key)); }
            };
            setLabel('renameProjectBtn', 'header.renameProject');
            setLabel('deleteProjectBtn', 'header.deleteProject');
            setLabel('themeToggleBtn', 'header.themeToggle');
            setLabel('reloadBtn', 'header.reload');
            setLabel('languageSelector', 'header.languageLabel');
            setLabel('projectSelector', 'header.projectLabel');
            setLabel('clearGlobalSearch', 'filters.searchClearLabel');
            document.querySelectorAll('.close-btn').forEach(b => { b.title = t('modal.close'); b.setAttribute('aria-label', t('modal.close')); });
            const gs = document.getElementById('globalSearchInput');
            if (gs) gs.setAttribute('aria-label', t('filters.search'));
            const as = document.getElementById('archiveSearch');
            if (as) as.setAttribute('aria-label', t('archives.search'));
            ['filterTagSelect', 'filterCategorySelect', 'filterUserSelect', 'filterPrioritySelect'].forEach((id, i) => {
                const el = document.getElementById(id);
                if (el) el.setAttribute('aria-label', t(['filters.tags', 'filters.category', 'filters.user', 'filters.priority'][i]).replace(/[:：]\s*$/, ''));
            });
            const banner = document.getElementById('syncBanner');
            if (banner) banner.setAttribute('aria-label', t('sync.bannerLabel'));
            [['syncRetryBtn', 'sync.retry'], ['syncDownloadBtn', 'sync.download'], ['syncCopyBtn', 'sync.copy'], ['syncReloadBtn', 'sync.reload']].forEach(([id, key]) => {
                const el = document.getElementById(id);
                if (el) el.textContent = t(key);
            });
            const title = document.getElementById('headerTitle');
            if (title && typeof BUILD_INFO !== 'undefined') title.title = t('header.buildInfo', { version: BUILD_INFO.version, hash: BUILD_INFO.sourceHash });

            // Update language selector to match current language
            document.getElementById('languageSelector').value = currentLanguage;
            document.documentElement.lang = t('locale.dates').split('-')[0] === 'zh' ? 'zh-CN' : t('locale.dates').split('-')[0];

            // Update welcome screen
            renderWelcomeScreen();

            // Update modals
            renderTaskDetailModal();
            updateTaskFormLabels();
            renderColumnsModal();
            renderArchivesModal();

            // Update filters
            updateFilterLabels();
        }

        // Render welcome screen with translations
        function renderWelcomeScreen() {
            const welcomeScreen = document.getElementById('welcomeScreen');
            if (welcomeScreen) {
                welcomeScreen.innerHTML = `
            <h2>${t('welcome.title')}</h2>
            <p>${t('welcome.description')}</p>
            <button onclick="document.getElementById('selectFolderBtn').click()" class="btn btn-primary" style="font-size: 1.1rem; padding: 0.8rem 2rem;">
                ${t('welcome.start')}
            </button>
            <div style="margin-top: 2rem; padding: 1.5rem; background: white; border-radius: 8px; max-width: 600px; margin-left: auto; margin-right: auto; text-align: left;">
                <h3 style="margin-bottom: 1rem;">${t('welcome.howItWorks')}</h3>
                <ol style="margin-left: 1.5rem; color: var(--text-secondary);">
                    <li>${t('welcome.step1')}</li>
                    <li>${t('welcome.step2')}</li>
                    <li>${t('welcome.step3')}</li>
                    <li>${t('welcome.step4')}</li>
                    <li>${t('welcome.step5')}</li>
                </ol>
                <p style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-secondary);">
                    ${t('welcome.browserWarning')}
                </p>
            </div>
                `;
            }
        }

        // Render task detail modal structure with translations
        function renderTaskDetailModal() {
            const modalTitle = document.getElementById('modalTitle');
            if (modalTitle) {
                modalTitle.textContent = t('taskDetail.title');
            }

            // An open detail dialog is re-rendered in the new language IN ITS OWN CONTEXT: a dialog of
            // an archived task must stay read-only (no edit / archive / delete buttons).
            const taskModal = document.getElementById('taskModal');
            if (taskModal && taskModal.classList.contains('active') && currentDetailTask) {
                showTaskDetail(currentDetailTask, { rerender: true });
            }
        }

        // Update task form labels and placeholders
        function updateTaskFormLabels() {
            const formLabels = {
                'taskTitle': { prev: 'label', text: t('taskForm.titleLabel') },
                'taskStatus': { prev: 'label', text: t('taskForm.columnLabel') },
                'taskPriority': { prev: 'label', text: t('taskForm.priorityLabel') },
                'taskCategory': { prev: 'label', text: t('taskForm.categoryLabel'), placeholder: t('taskForm.categoryPlaceholder') },
                'taskAssignee': { prev: 'label', text: t('taskForm.assignedLabel'), placeholder: t('taskForm.assignedPlaceholder') },
                'taskCreated': { prev: 'label', text: t('taskForm.createdLabel') },
                'taskStarted': { prev: 'label', text: t('taskForm.startedLabel') },
                'taskDue': { prev: 'label', text: t('taskForm.dueLabel') },
                'taskCompleted': { prev: 'label', text: t('taskForm.completedLabel') },
                'taskTags': { prev: 'label', text: t('taskForm.tagsLabel'), placeholder: t('taskForm.tagsPlaceholder') },
                'taskDescription': { prev: 'label', text: t('taskForm.descriptionLabel') },
                'taskNotes': { prev: 'label', text: t('taskForm.notesLabel'), placeholder: t('taskForm.notesPlaceholder') },
                'formSubtaskInput': { placeholder: t('taskForm.subtaskPlaceholder') }
            };

            // Update all labels and placeholders
            Object.keys(formLabels).forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;

                const config = formLabels[id];

                // Update label
                if (config.prev === 'label') {
                    const label = el.previousElementSibling;
                    if (label && label.tagName === 'LABEL') {
                        label.textContent = config.text;
                    } else {
                        // Try to find label by for attribute
                        const labelEl = document.querySelector(`label[for="${id}"]`);
                        if (labelEl) labelEl.textContent = config.text;
                    }
                }

                // Update placeholder
                if (config.placeholder) {
                    el.placeholder = config.placeholder;
                }
            });

            // Priority options: same list as when the form was opened (configured priorities + a
            // custom value), only the labels change; the selected value is kept (the form may be
            // open with unsaved input).
            renderPriorityOptions();

            // Update form help texts
            const tagsHelp = document.querySelector('label[for="taskTags"] + input + small');
            if (tagsHelp) tagsHelp.textContent = t('taskForm.tagsHelp');

            const notesHelp = document.querySelector('#taskNotes + small');
            if (notesHelp) notesHelp.textContent = t('taskForm.notesHelp');

            // Update subtasks label
            const subtasksLabel = document.querySelector('#formSubtasksList').previousElementSibling;
            if (subtasksLabel) subtasksLabel.textContent = t('taskForm.subtasksLabel');

            // Update subtask add button
            const subtaskBtn = document.querySelector('#formSubtaskInput + button');
            if (subtaskBtn) subtaskBtn.textContent = t('taskForm.subtaskAdd');

            // Update cancel button
            const cancelBtn = document.querySelector('#newTaskForm .actions button[type="button"]');
            if (cancelBtn) cancelBtn.textContent = t('taskForm.cancel');
        }

        // Update filter bar labels
        function updateFilterLabels() {
            const filterBar = document.getElementById('filterBar');
            if (!filterBar) return;

            // Update global search placeholder
            const searchInput = document.getElementById('globalSearchInput');
            if (searchInput) searchInput.placeholder = t('filters.search');

            // Update filter labels
            const labels = filterBar.querySelectorAll('label');
            if (labels[0]) labels[0].textContent = t('filters.tags');
            if (labels[1]) labels[1].textContent = t('filters.category');
            if (labels[2]) labels[2].textContent = t('filters.user');
            if (labels[3]) labels[3].textContent = t('filters.priority');

            // Update select options
            const selects = filterBar.querySelectorAll('select option[value=""]');
            selects.forEach(opt => opt.textContent = t('filters.select'));

            // Update clear button
            const clearBtn = filterBar.querySelector('button[onclick="clearFilters()"]');
            if (clearBtn) clearBtn.textContent = t('filters.clearAll');
        }

        // Render columns modal structure with translations
        function renderColumnsModal() {
            const modalTitle = document.getElementById('columnsModalTitle');
            if (modalTitle) modalTitle.textContent = t('columns.title');

            const addBtn = document.getElementById('addColumnBtn');
            if (addBtn) addBtn.textContent = t('columns.add');
        }

        // Render archives modal structure with translations
        function renderArchivesModal() {
            const modalTitle = document.getElementById('archiveModalTitle');
            if (modalTitle) modalTitle.textContent = t('archives.title');

            const searchInput = document.getElementById('archiveSearch');
            if (searchInput) searchInput.placeholder = t('archives.search');
        }

        // Set language and save to localStorage
        function setLanguage(lang) {
            if (!translations[lang]) {
                console.warn(`Language "${lang}" not available, falling back to English`);
                lang = 'en';
            }

            currentLanguage = lang;
            localStorage.setItem('preferredLanguage', lang);

            // Update static text elements
            updateStaticTexts();

            // Update filter dropdowns (including priorities)
            updateAutocomplete();

            // Re-render the interface (display only: task data and column names are not touched)
            renderKanban();
            updateProjectSelector();
            renderArchivesModal();
            renderSyncBanner();
            if (document.getElementById('archiveModal').classList.contains('active')) {
                renderArchiveList(document.getElementById('archiveSearch').value);
            }

            console.log(`Language changed to: ${lang}`);
        }

        // Initialize language based on saved preference or browser language
        function initLanguage() {
            // Check for saved preference first
            const savedLang = localStorage.getItem('preferredLanguage');
            if (savedLang && translations[savedLang]) {
                currentLanguage = savedLang;
                return;
            }

            // Detect browser language (first supported entry of navigator.languages)
            const candidates = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || navigator.userLanguage || 'en']);
            currentLanguage = 'en'; // Default fallback
            for (const browserLang of candidates) {
                const lower = String(browserLang).toLowerCase();
                const langCode = lower.split('-')[0]; // e.g., "ja-JP" -> "ja"
                if (lower.startsWith('zh') && translations.zh_cn) { currentLanguage = 'zh_cn'; break; }
                if (translations[langCode]) { currentLanguage = langCode; break; }
            }

            // Save the detected/default language
            localStorage.setItem('preferredLanguage', currentLanguage);

            console.log(`Language initialized to: ${currentLanguage}`);
        }

        // Initialize language on page load
        initLanguage();
        // Update static texts after DOM loads
        document.addEventListener('DOMContentLoaded', updateStaticTexts);

        // Check if File System Access API is supported
        if (!('showDirectoryPicker' in window)) {
            alert(t('alert.browserNotSupported'));
        }

        // IndexedDB for persisting directory handles (multiple projects)
        const DB_NAME = 'TaskManagerDB';
        const DB_VERSION = 2; // Increment version for schema change
        const STORE_NAME = 'settings';
        const PROJECTS_KEY = 'recentProjects';
        const MAX_RECENT_PROJECTS = 10;
