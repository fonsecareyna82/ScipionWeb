Scipion-web
===========

**Scipion-web** is the new React-based frontend for the Scipion framework.  
It provides a modern and interactive web interface to manage Scipion projects and protocols, replacing the legacy NiceGUI interface.

This application communicates with a **FastAPI** backend and renders dynamic protocol workflows using **ReactFlow**, offering both graphical and tabular views.

.. contents::
   :local:
   :depth: 2

Overview
--------

Scipion-web allows users to:

- Create and manage Scipion projects directly from a web dashboard.
- Visualize protocol workflows as interactive graphs (ReactFlow).
- Inspect protocol parameters, progress, and dependencies in real time.
- Trigger new protocol executions through the FastAPI backend.
- Switch between *hierarchical (graph)* and *table* views.
- Rename or delete projects via API.

The UI is designed with **ShadCN/UI** and **TailwindCSS**, ensuring a clean, modern, and responsive look.

Tech Stack
----------

+------------------------+------------------------------------------+
| Layer                 | Technology                               |
+========================+==========================================+
| **Frontend Framework** | React 18 + TypeScript                    |
+------------------------+------------------------------------------+
| **UI / Design**        | TailwindCSS + ShadCN/UI                  |
+------------------------+------------------------------------------+
| **Graph Visualization**| ReactFlow                                |
+------------------------+------------------------------------------+
| **Routing**            | React Router                             |
+------------------------+------------------------------------------+
| **Icons**              | Lucide-react                             |
+------------------------+------------------------------------------+
| **State Management**   | React Hooks + LocalStorage persistence   |
+------------------------+------------------------------------------+
| **Backend API**        | FastAPI (Python)                         |
+------------------------+------------------------------------------+
| **Async Task Queue**   | Celery (for long-running protocol jobs)  |
+------------------------+------------------------------------------+

Project Structure
-----------------

::

   scipion-web/
   │
   ├── src/
   │   ├── api/
   │   │   └── projects.ts           # API calls to FastAPI backend
   │   ├── components/
   │   │   ├── protocol/
   │   │   │   ├── ProtocolForm.tsx
   │   │   │   ├── ProtocolNodeCardWrapper.tsx
   │   │   │   ├── ProtocolsDrawer.tsx
   │   │   │   └── ...
   │   ├── pages/
   │   │   ├── dashboard/
   │   │   │   └── DashboardPage.tsx # Project list view
   │   │   └── project/
   │   │       └── ProjectPage.tsx   # Graph + Table + Context menu
   │   ├── utils/
   │   │   └── graph_utils.ts        # Node/edge builders and helpers
   │   ├── icons/
   │   │   └── index.tsx
   │   └── main.tsx
   │
   ├── public/
   │   └── index.html
   │
   ├── package.json
   ├── tsconfig.json
   ├── tailwind.config.js
   └── README.rst

Installation & Setup
--------------------

1. **Clone the repository**

   .. code-block:: bash

      git clone https://github.com/yourusername/scipion-web.git
      cd scipion-web

2. **Install dependencies**

   .. code-block:: bash

      npm install
      # or
      yarn install

3. **Run in development mode**

   .. code-block:: bash

      npm run dev

   Default URL: http://localhost:5173

4. **Build for production**

   .. code-block:: bash

      npm run build

   Static files will be generated in the ``dist/`` directory.

FastAPI Backend Configuration
-----------------------------

Scipion-web communicates with the **FastAPI backend**, which must expose the following endpoints:

+----------+------------------------------------+------------------------------------------------+
| Method   | Endpoint                           | Description                                    |
+==========+====================================+================================================+
| GET      | /projects/                         | List all projects                              |
+----------+------------------------------------+------------------------------------------------+
| POST     | /projects/                         | Create a new project                           |
+----------+------------------------------------+------------------------------------------------+
| GET      | /projects/{name}                   | Retrieve project details (protocols, status)   |
+----------+------------------------------------+------------------------------------------------+
| PUT      | /projects/{name}/rename            | Rename a project                               |
+----------+------------------------------------+------------------------------------------------+
| DELETE   | /projects/{name}                   | Delete a project                               |
+----------+------------------------------------+------------------------------------------------+
| GET      | /projects/{name}/protocol/{id}     | Get protocol details                           |
+----------+------------------------------------+------------------------------------------------+
| POST     | /projects/{name}/protocol/new      | Create a new protocol                          |
+----------+------------------------------------+------------------------------------------------+

Example FastAPI setup
~~~~~~~~~~~~~~~~~~~~~

.. code-block:: python

   from fastapi import FastAPI
   from fastapi.middleware.cors import CORSMiddleware

   app = FastAPI()

   origins = [
       "http://localhost:5173",
       "http://127.0.0.1:5173",
   ]

   app.add_middleware(
       CORSMiddleware,
       allow_origins=origins,
       allow_credentials=True,
       allow_methods=["*"],
       allow_headers=["*"],
   )

   @app.get("/projects/")
   def list_projects():
       return [{"name": "demo_project", "created": "2025-10-10"}]

Key Components
--------------

**ProjectPage.tsx**

Displays a detailed project view with:

- ReactFlow graph of protocols and dependencies.
- Auto-refresh (every 15 seconds) for running protocols.
- Switchable *table view* for detailed progress.
- Right-click context menu (refresh, clear, add protocol).
- Node persistence via LocalStorage (no flicker on refresh).

**DashboardPage.tsx**

Professional ShadCN dashboard showing all projects:

- Displays name, creation date, and status.
- Includes Rename/Delete buttons (API-integrated).

**ProtocolsDrawer.tsx**

Slide-out drawer for launching new protocols from available templates.

Graph Behavior
--------------

- Zoom/Pan are preserved across refreshes and view changes.
- TB View: root node centered horizontally (top).
- LR View: root node centered vertically (left).
- Running protocols increment their elapsed time every second.
- No flicker: nodes/edges are merged instead of re-rendered.

Development Notes
-----------------

- Code style: **CamelCase** for variables, lowercase for filenames.
- All comments and UI text in **English**.
- Node positions are stored using the key pattern::

    project-{projectName}-node-positions-{graphDirection}

- ReactFlow instance is globally accessible::

    (window as any).reactFlowInstance

- Default refresh interval: **15 seconds**.

Future Roadmap
--------------

- Authentication (JWT-based user sessions).
- Protocol creation wizard with templates.
- Real-time backend updates via WebSockets.
- Multi-project overview dashboard.
- Protocol logs and live status visualization.


Authors
-------

**Yunior Fonseca Reyna** — https://github.com/fonsecareyna82 with contributions from the **Scipion Core Team**.
