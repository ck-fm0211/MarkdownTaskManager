        // File System Access API
        // directoryHandle = folder of the project currently shown. Per-project FILE state (handles,
        // the content each file had when it was read, pending saves, conflicts) lives in `session`
        // (see 14-sync.js) and is recreated on every project switch, so nothing leaks between
        // projects.
        let directoryHandle = null;
        let tasks = [];
        let config = {};
        let activeFilters = []; // Array of {type: 'tag'|'category'|'user', value: string}
        let globalSearchTerm = ''; // Global search term (id, title, description, notes, tags, ...)
        let isEditMode = false;
        let currentDetailTask = null;
        let formSubtasks = [];
        let archivedTasks = [];
        let wasArchiveModalActive = false;
        let loadedFormatV2 = false; // true once the loaded kanban.md is V2 (status carried by a **Status** field)
        let loadedArchiveV2 = false; // true once the loaded archive.md carries the v2 format marker
