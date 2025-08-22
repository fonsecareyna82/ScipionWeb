import { useParams } from "react-router-dom";
import { useEffect, useState, useMemo } from 'react';
import { fetchProject, Project, fetchProtocolDetails } from "../../../api/projects";
import ProtocolForm from "../../../components/projects/ProtocolForm";
import { buildGraphElements } from "../../../utils/graph_utils";

import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import { FindIcon, RefreshIcon } from "../../../icons";
import 'reactflow/dist/style.css';
import { createStatusNodeWrapper } from "../../../components/projects/StatusNodeWrapper";

const REFRESH_INTERVAL_MS = 15000; // 15 seconds

export default function ProjectPage() {
  const { projectName } = useParams();
  const [project, setProject] = useState<Project>();
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<any>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previousNodeId, setPreviousNodeId] = useState<string | null>(null);

  const handleNodeClick = (nodeData: any, event?: React.MouseEvent) => {
    const isMultiSelect = event?.shiftKey;
  
    if (!isMultiSelect) {
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
  };

  // 🔹 Doble click → open the protocol form
  const handleNodeDoubleClick = async (nodeData: any) => {
    try {
      if (projectName) {
        const fullNodeData = await fetchProtocolDetails(projectName, nodeData.id);
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

  const handleSearch = (query: string) => {
    const reactFlowInstance = (window as any).reactFlowInstance;
    if (!reactFlowInstance) return;
  
    if (!query.trim()) {
      // 🔹 Deseleccionar nodos y edges
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          style: undefined,
        }))
      );
  
      setEdges((eds) =>
        eds.map((edge) => ({
          ...edge,
          style: {
            stroke: '#999',
            strokeWidth: 2,
          },
        }))
      );
  
      // 🔹 Reset selected node
      setPreviousNodeId(null);
  
      // Adjust view
      setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.2, duration: 800 });
      }, 100);
  
      return;
    }
  
    const match = nodes.find(
      (node) =>
        node.id.toLowerCase().includes(query.toLowerCase()) ||
        (node.data?.label?.toLowerCase?.().includes(query.toLowerCase()))
    );
  
    if (!match) return;
  
    handleNodeClick(match);
  
    reactFlowInstance.setCenter(match.position.x, match.position.y, {
      zoom: reactFlowInstance.getViewport().zoom,
      duration: 800,
    });
  };
  
  

  return (
    <div className="p-6 h-screen">
            <h1 className="text-2xl mb-4">{projectName}</h1>
      < div className="relative mb-6 w-full max-w-sm">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <FindIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
        </div>
        <input
          type="text"
          placeholder="Search protocol..."
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full px-3 py-2 pl-10 pr-3 border border-gray-300 rounded-md 
                           focus:outline-none focus:ring-2 focus:ring-blue-500 
                           dark:bg-gray-800 dark:border-gray-700 dark:text-white"
        />
      </div>
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

            <div className="absolute inset-0">

              
            </div>

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
                style: { stroke: "#999", strokeWidth: 2 },
                markerEnd: 'url(#circle)',
              }}
              onInit={(instance) => {
                (window as any).reactFlowInstance = instance;
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
