# Center To-Do

A GNOME Shell extension that displays a to-do list in the center of the primary monitor, on the desktop background behind application windows.

<img width="805" height="776" alt="Screenshot From 2026-10-11 09-23-52" src="https://github.com/user-attachments/assets/1815ceeb-cd0e-4c71-9f9c-32614d3c4d1f" />


## Features

- Add a task by typing and pressing Enter, or clicking the plus button.
- Mark tasks complete or pending with the checkbox.
- Delete individual tasks or clear completed tasks using the header action.
- Open the task file in your default text editor.
- Monitor external edits to `~/todo.txt` and refresh the widget.
- Automatically center the widget when tasks or the monitor layout change.

## Requirements

GNOME Shell and its `gnome-extensions` command. The extension metadata declares GNOME Shell versions 45–50; compatibility across every listed version has not been verified. No build step or additional JavaScript packages are required.

This repository contains the desktop extension. The separate standalone `center-todo` application is not included.

## Installation

Clone the repository, then package and install the extension:

```sh
git clone https://github.com/llit-comau/center-todo.git
cd center-todo
gnome-extensions pack --force
gnome-extensions install --force center-todo@mash.shell-extension.zip
```

Log out and back in so GNOME Shell discovers the extension, then enable it:

```sh
gnome-extensions enable center-todo@mash
```

Minimize your windows to see the widget on the desktop. It stays centered on the primary monitor and does not support dragging.

To disable it:

```sh
gnome-extensions disable center-todo@mash
```

## Task storage

Tasks are saved locally in `~/todo.txt`, one task per line. Completed tasks use an `x ` prefix:

```text
Buy groceries
x Water the plants
```

Blank lines are ignored. The extension rewrites the file when tasks change. It adds introductory tasks when enabled with a missing or empty task file. Back up an existing task file before first use if needed.

Your personal task file is not included in this repository.

## Source files

- `extension.js`: widget UI, task storage, file monitoring, and positioning.
- `stylesheet.css`: widget appearance.
- `metadata.json`: extension identity and declared Shell versions.

The extension uses GJS with GNOME's St, Clutter, Gio, and GLib APIs. It attaches to GNOME Shell's internal background group, so Shell updates may require compatibility changes.
