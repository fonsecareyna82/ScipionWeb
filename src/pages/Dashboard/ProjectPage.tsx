import { useParams } from "react-router-dom";
import { useEffect, useState, useMemo } from 'react';
import { fetchProject, Project, fetchProtocolDetails } from "../../api/projects";
import ProtocolForm from "../../components/projects/ProtocolForm";
import { buildGraphElements } from "../../utils/graph_utils";

import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import { RefreshIcon } from "../../icons";
import 'reactflow/dist/style.css';
import { createStatusNodeWrapper } from "../../components/projects/StatusNodeWrapper";

const REFRESH_INTERVAL_MS = 15000; // 15 seconds

export default function ProjectPage() {
  const { projectName } = useParams();
  const [project, setProject] = useState<Project>();
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<any>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previousNodeId, setPreviousNodeId] = useState<string | null>(null);

  // 🔹 Click → resalta pero NO cierra formulario si está abierto
  const handleNodeClick = (nodeData: any) => {
    setPreviousNodeId(nodeData.id);

    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeData.id ? node : { ...node, style: undefined }
      )
    );

    setEdges((eds) =>
      eds.map((edge) =>
        edge.source === nodeData.id || edge.target === nodeData.id
          ? {
            ...edge,
            style: {
              ...edge.style,
              stroke: '#0070f3',
              strokeWidth: 3,
            },
          }
          : { ...edge, style: undefined }
      )
    );
  };

  // 🔹 Doble click → open the protocol form
  const handleNodeDoubleClick = async (nodeData: any) => {
    try {
      if (projectName) {
        const fullNodeData = await fetchProtocolDetails(nodeData.id);
        setSelectedNodeDetails(fullNodeData);
        setPreviousNodeId(nodeData.id);

        setNodes((nds) =>
          nds.map((node) =>
            node.id === nodeData.id ? node : { ...node, style: undefined }
          )
        );

        setEdges((eds) =>
          eds.map((edge) =>
            edge.source === nodeData.id || edge.target === nodeData.id
              ? {
                ...edge,
                style: {
                  ...edge.style,
                  stroke: '#0070f3',
                  strokeWidth: 3,
                },
              }
              : { ...edge, style: undefined }
          )
        );
      }
    } catch (err) {
      console.error('Failed to fetch protocol details', err);
    }
  };

  // Close only from the button/X of the form
  const handleCloseForm = () => {
    setSelectedNodeDetails(null);
  };

  const nodeTypes = useMemo(
    () => ({
      status: createStatusNodeWrapper(
        handleNodeClick,
        handleNodeDoubleClick,
        previousNodeId ?? undefined
      ),
    }),
    [previousNodeId]
  );

  // Fetch project data when projectName changes
  useEffect(() => {
    if (!projectName) return;

    setProject(undefined);
    setNodes([]);
    setEdges([]);
    setSelectedNodeDetails(null);
    setPreviousNodeId(null);

    fetchProject(projectName)
      .then((data) => {
        setProject(data);
        const { nodes, edges } = buildGraphElements(data.protocols);
        setNodes(nodes);
        setEdges(edges);
      })
      .catch((err) => console.error(err));
  }, [projectName, setNodes, setEdges]);

  const handleRefresh = () => {
    if (projectName) {
      setIsRefreshing(true);
      fetchProject(projectName)
        .then((data) => {
          setProject(data);
          const { nodes, edges } = buildGraphElements(data.protocols);
          setNodes(nodes);
          setEdges(edges);
        })
        .catch((err) => console.error(err))
        .finally(() => setIsRefreshing(false));
    }
  };

  return (
    <div className="p-6 h-screen">
      <h1 className="text-2xl mb-4">Project: {projectName}</h1>

      {!project ? (
        <p className="text-gray-500">Loading project data...</p>
      ) : (
        <div className="h-[80vh] border rounded shadow relative">
          <ReactFlowProvider>
            {selectedNodeDetails && (
              <ProtocolForm data={selectedNodeDetails} onClose={handleCloseForm} />
            )}
            <svg width="0" height="0">
              <defs>
                <marker
                  id="circle"
                  viewBox="0 0 40 40"
                  refX="20"
                  refY="20"
                  markerWidth="20"
                  markerHeight="20"
                  orient="auto-start-reverse"
                >
                  <circle cx="20" cy="20" r="10" fill="#ff0000" />
                </marker>
              </defs>
            </svg>

            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              defaultEdgeOptions={{
                type: 'default',
                style: { stroke: "#999", strokeWidth: 2},
                markerEnd: 'url(#circle)',
              }}
            >
              <Background />
              <Controls position="top-right" showInteractive={false}>
                <button
                  className="refresh-btn"
                  title="Refresh project"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshIcon
                    className={`w-5 h-4 text-blue-600 dark:text-gray-100 dark:bg-gray-200 mr-1 ml-1 mt-1 ${isRefreshing ? 'animate-spin' : ''
                      }`}
                  />
                </button>
              </Controls>
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      )}
    </div>
  );
}
