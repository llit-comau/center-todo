import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const CenterTodoWidget = GObject.registerClass(
class CenterTodoWidget extends St.BoxLayout {
    _init(filePath) {
        super._init({
            style_class: 'center-todo-widget',
            vertical: true,
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this._filePath = filePath;
        this._tasks = [];
        this._isWriting = false;
        this._repositionId = 0;
        this._writeResetId = 0;

        this._buildUI();
        this._setupFileMonitor();
        this._initAndLoadTasks();

        Main.layoutManager.connectObject('monitors-changed', () => this._scheduleReposition(), this);
    }

    _buildUI() {
        // --- Header ---
        this._headerBox = new St.BoxLayout({
            style_class: 'center-todo-header',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const headerIcon = new St.Icon({
            icon_name: 'checkbox-checked-symbolic',
            icon_size: 18,
            style_class: 'center-todo-header-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._headerBox.add_child(headerIcon);

        const titleLabel = new St.Label({
            text: 'To-Do List',
            style_class: 'center-todo-title',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._headerBox.add_child(titleLabel);

        this._badgeLabel = new St.Label({
            text: '0 tasks',
            style_class: 'center-todo-badge',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._headerBox.add_child(this._badgeLabel);

        // Header Spacer
        const headerSpacer = new St.Widget({ x_expand: true });
        this._headerBox.add_child(headerSpacer);

        // Header Action: Open file in default text editor
        const openBtn = new St.Button({
            style_class: 'center-todo-icon-btn',
            reactive: true,
            can_focus: true,
            child: new St.Icon({
                icon_name: 'document-edit-symbolic',
                icon_size: 14,
            }),
        });
        openBtn.connect('clicked', () => this._openInEditor());
        this._headerBox.add_child(openBtn);

        // Header Action: Clear completed tasks
        const clearBtn = new St.Button({
            style_class: 'center-todo-icon-btn',
            reactive: true,
            can_focus: true,
            child: new St.Icon({
                icon_name: 'edit-clear-all-symbolic',
                icon_size: 14,
            }),
        });
        clearBtn.connect('clicked', () => this._clearCompleted());
        this._headerBox.add_child(clearBtn);

        this.add_child(this._headerBox);

        // --- Divider ---
        const divider = new St.Widget({ style_class: 'center-todo-divider' });
        this.add_child(divider);

        // --- Tasks Scroll Area ---
        this._scrollView = new St.ScrollView({
            style_class: 'center-todo-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            x_expand: true,
        });

        this._tasksBox = new St.BoxLayout({
            style_class: 'center-todo-tasks-box',
            vertical: true,
            x_expand: true,
        });
        this._scrollView.set_child(this._tasksBox);
        this.add_child(this._scrollView);

        // --- Input Bar ---
        this._inputBar = new St.BoxLayout({
            style_class: 'center-todo-input-bar',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._entry = new St.Entry({
            style_class: 'center-todo-entry',
            hint_text: 'Add a new task... (press Enter)',
            x_expand: true,
            can_focus: true,
            reactive: true,
        });

        this._entry.clutter_text.connect('activate', () => {
            const text = this._entry.get_text().trim();
            if (text.length > 0) {
                this._addTask(text);
                this._entry.set_text('');
            }
        });

        this._entry.clutter_text.connect('key-press-event', (actor, event) => {
            const symbol = event.get_key_symbol();
            if (symbol === Clutter.KEY_Escape) {
                this._entry.set_text('');
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this._inputBar.add_child(this._entry);

        const addBtn = new St.Button({
            style_class: 'center-todo-add-btn',
            reactive: true,
            can_focus: true,
            child: new St.Icon({
                icon_name: 'list-add-symbolic',
                icon_size: 15,
            }),
        });
        addBtn.connect('clicked', () => {
            const text = this._entry.get_text().trim();
            if (text.length > 0) {
                this._addTask(text);
                this._entry.set_text('');
                this._entry.grab_key_focus();
            }
        });
        this._inputBar.add_child(addBtn);

        this.add_child(this._inputBar);
    }

    _initAndLoadTasks() {
        try {
            if (!GLib.file_test(this._filePath, GLib.FileTest.EXISTS)) {
                const sample = "Welcome to your To-Do list!\nClick the circle to finish a task\nType below and press Enter to add a task\n";
                GLib.file_set_contents(this._filePath, sample);
            } else {
                const [ok, bytes] = GLib.file_get_contents(this._filePath);
                if (ok && bytes.length === 0) {
                    const sample = "Welcome to your To-Do list!\nClick the circle to finish a task\nType below and press Enter to add a task\n";
                    GLib.file_set_contents(this._filePath, sample);
                }
            }
        } catch (e) {
            console.error('[CenterTodo] Failed to initialize file:', e);
        }
        this._loadTasks();
    }

    _loadTasks() {
        try {
            if (!GLib.file_test(this._filePath, GLib.FileTest.EXISTS)) {
                this._tasks = [];
                this._renderTasks();
                return;
            }

            const [ok, bytes] = GLib.file_get_contents(this._filePath);
            if (!ok) return;

            const decoder = new TextDecoder('utf-8');
            const content = decoder.decode(bytes);
            const lines = content.split('\n');

            this._tasks = [];
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                const isDone = /^x\s+/i.test(trimmed);
                const text = isDone ? trimmed.replace(/^x\s+/i, '') : trimmed;

                this._tasks.push({
                    text,
                    completed: isDone,
                });
            }

            this._renderTasks();
        } catch (e) {
            console.error('[CenterTodo] Failed to load tasks:', e);
        }
    }

    _saveTasks() {
        try {
            this._isWriting = true;
            if (this._writeResetId) {
                GLib.source_remove(this._writeResetId);
            }

            const lines = this._tasks.map(t => t.completed ? `x ${t.text}` : t.text);
            const content = lines.length > 0 ? lines.join('\n') + '\n' : '';
            const encoder = new TextEncoder();
            const bytes = encoder.encode(content);

            GLib.file_set_contents(this._filePath, bytes);

            this._writeResetId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
                this._isWriting = false;
                this._writeResetId = 0;
                return GLib.SOURCE_REMOVE;
            });
        } catch (e) {
            this._isWriting = false;
            console.error('[CenterTodo] Failed to save tasks:', e);
        }
    }

    _addTask(text) {
        this._tasks.push({
            text,
            completed: false,
        });
        this._saveTasks();
        this._renderTasks();

        // Scroll to bottom
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            const vscroll = this._scrollView.get_vscroll_bar();
            if (vscroll) {
                const adj = vscroll.get_adjustment();
                adj.set_value(adj.get_upper());
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _toggleTask(index) {
        if (index < 0 || index >= this._tasks.length) return;
        this._tasks[index].completed = !this._tasks[index].completed;
        this._saveTasks();
        this._renderTasks();
    }

    _deleteTask(index) {
        if (index < 0 || index >= this._tasks.length) return;
        this._tasks.splice(index, 1);
        this._saveTasks();
        this._renderTasks();
    }

    _clearCompleted() {
        const remaining = this._tasks.filter(t => !t.completed);
        if (remaining.length === this._tasks.length) return;
        this._tasks = remaining;
        this._saveTasks();
        this._renderTasks();
    }

    _openInEditor() {
        try {
            const file = Gio.File.new_for_path(this._filePath);
            Gio.AppInfo.launch_default_for_uri_async(file.get_uri(), null, null, null);
        } catch (err) {
            console.error('[CenterTodo] Error opening text editor:', err);
        }
    }

    _renderTasks() {
        this._tasksBox.destroy_all_children();

        const total = this._tasks.length;
        const remaining = this._tasks.filter(t => !t.completed).length;

        if (total === 0) {
            this._badgeLabel.set_text('0 tasks');
            const emptyLabel = new St.Label({
                text: '🎉 All caught up! Add a new task below.',
                style_class: 'center-todo-empty',
                x_expand: true,
                x_align: Clutter.ActorAlign.CENTER,
            });
            this._tasksBox.add_child(emptyLabel);
        } else {
            if (remaining === 0) {
                this._badgeLabel.set_text('All done! 🎉');
            } else {
                this._badgeLabel.set_text(`${remaining} pending`);
            }

            this._tasks.forEach((task, index) => {
                const row = new St.BoxLayout({
                    style_class: 'center-todo-row',
                    reactive: true,
                    track_hover: true,
                    x_expand: true,
                    y_align: Clutter.ActorAlign.CENTER,
                });

                // Checkbox / Finish Button
                const checkBtn = new St.Button({
                    style_class: task.completed ? 'center-todo-checkbox checked' : 'center-todo-checkbox',
                    reactive: true,
                    can_focus: true,
                    y_align: Clutter.ActorAlign.CENTER,
                    child: new St.Icon({
                        icon_name: task.completed ? 'checkbox-checked-symbolic' : 'checkbox-symbolic',
                        icon_size: 16,
                    }),
                });
                checkBtn.connect('clicked', () => this._toggleTask(index));
                row.add_child(checkBtn);

                // Task Label
                const label = new St.Label({
                    text: task.text,
                    style_class: task.completed ? 'center-todo-text done' : 'center-todo-text',
                    x_expand: true,
                    y_align: Clutter.ActorAlign.CENTER,
                });
                row.add_child(label);

                // Delete Button
                const delBtn = new St.Button({
                    style_class: 'center-todo-del-btn',
                    reactive: true,
                    can_focus: true,
                    y_align: Clutter.ActorAlign.CENTER,
                    child: new St.Icon({
                        icon_name: 'window-close-symbolic',
                        icon_size: 13,
                    }),
                });
                delBtn.connect('clicked', () => this._deleteTask(index));
                row.add_child(delBtn);

                this._tasksBox.add_child(row);
            });
        }

        this._scheduleReposition();
    }

    _setupFileMonitor() {
        try {
            const file = Gio.File.new_for_path(this._filePath);
            this._fileMonitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
            this._monitorId = this._fileMonitor.connect('changed', (mon, f, other, eventType) => {
                if (this._isWriting) return;
                if (
                    eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
                    eventType === Gio.FileMonitorEvent.CHANGED ||
                    eventType === Gio.FileMonitorEvent.CREATED
                ) {
                    this._loadTasks();
                }
            });
        } catch (e) {
            console.error('[CenterTodo] Failed to setup file monitor:', e);
        }
    }

    _scheduleReposition() {
        if (this._repositionId) return;
        this._repositionId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._repositionId = 0;
            this._updatePosition();
            return GLib.SOURCE_REMOVE;
        });
    }

    _updatePosition() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) return;

        const targetW = 460;
        this.set_width(targetW);

        const [, natH] = this.get_preferred_height(targetW);
        const targetH = Math.max(natH, 120);

        const x = monitor.x + Math.floor((monitor.width - targetW) / 2);
        const y = monitor.y + Math.floor((monitor.height - targetH) / 2);

        if (this.x !== x || this.y !== y) {
            this.set_position(x, y);
        }
    }

    destroy() {
        if (this._repositionId) {
            GLib.source_remove(this._repositionId);
            this._repositionId = 0;
        }

        if (this._writeResetId) {
            GLib.source_remove(this._writeResetId);
            this._writeResetId = 0;
        }

        if (this._fileMonitor) {
            if (this._monitorId) {
                this._fileMonitor.disconnect(this._monitorId);
                this._monitorId = 0;
            }
            this._fileMonitor.cancel();
            this._fileMonitor = null;
        }

        Main.layoutManager.disconnectObject(this);

        super.destroy();
    }
});

export default class CenterTodoExtension extends Extension {
    enable() {
        const homeDir = GLib.get_home_dir();
        const todoPath = GLib.build_filenamev([homeDir, 'todo.txt']);
        this._widget = new CenterTodoWidget(todoPath);
        Main.layoutManager._backgroundGroup.add_child(this._widget);
    }

    disable() {
        if (this._widget) {
            Main.layoutManager._backgroundGroup.remove_child(this._widget);
            this._widget.destroy();
            this._widget = null;
        }
    }
}
