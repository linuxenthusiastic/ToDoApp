import React, { useState, useEffect, useReducer, useMemo, useCallback } from 'react';
import { Plus, Check, X, Edit2, Trash2, Calendar, Flag, Filter, Search, 
         Settings, HelpCircle, Undo2, Archive, Star, Clock, TrendingUp,
         Eye, EyeOff, BookOpen, ChevronRight, Info, Zap, Target, AlertCircle } from 'lucide-react';

// ============================================
// PATRONES DE DISEÑO Y ARQUITECTURA
// ============================================

// 1. SINGLETON: Servicio de gestión de tareas
class TaskService {
  static instance = null;
  
  static getInstance() {
    if (!TaskService.instance) {
      TaskService.instance = new TaskService();
    }
    return TaskService.instance;
  }
  
  // Heurística: Calcular prioridad automática basada en múltiples factores
  calculatePriority(task) {
    let score = 0;
    
    // Factor 1: Prioridad manual
    const priorityScores = { low: 1, medium: 3, high: 5, urgent: 8 };
    score += priorityScores[task.priority] || 0;
    
    // Factor 2: Fecha límite (urgencia temporal)
    if (task.dueDate) {
      const daysUntilDue = Math.ceil((new Date(task.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysUntilDue < 0) score += 10; // Vencida
      else if (daysUntilDue === 0) score += 8; // Hoy
      else if (daysUntilDue === 1) score += 6; // Mañana
      else if (daysUntilDue <= 3) score += 4; // Esta semana
      else if (daysUntilDue <= 7) score += 2; // Próxima semana
    }
    
    // Factor 3: Tags importantes
    if (task.tags.includes('urgent')) score += 3;
    if (task.tags.includes('important')) score += 2;
    
    return Math.min(score, 10); // Max 10
  }
  
  sortByPriority(tasks) {
    return [...tasks].sort((a, b) => 
      this.calculatePriority(b) - this.calculatePriority(a)
    );
  }
  
  filterTasks(tasks, filters) {
    return tasks.filter(task => {
      // Por status
      if (filters.status === 'active' && task.completed) return false;
      if (filters.status === 'completed' && !task.completed) return false;
      
      // Por prioridad
      if (filters.priority && filters.priority !== 'all' && task.priority !== filters.priority) return false;
      
      // Por búsqueda
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchTitle = task.title.toLowerCase().includes(searchLower);
        const matchDescription = task.description?.toLowerCase().includes(searchLower);
        const matchTags = task.tags.some(tag => tag.toLowerCase().includes(searchLower));
        if (!matchTitle && !matchDescription && !matchTags) return false;
      }
      
      // Por fecha
      if (filters.dateRange === 'today') {
        const today = new Date().toDateString();
        const taskDate = task.dueDate ? new Date(task.dueDate).toDateString() : null;
        if (taskDate !== today) return false;
      }
      if (filters.dateRange === 'week') {
        const weekFromNow = new Date();
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        const taskDate = task.dueDate ? new Date(task.dueDate) : null;
        if (!taskDate || taskDate > weekFromNow) return false;
      }
      
      return true;
    });
  }
}

// 2. FACTORY PATTERN: Creador de tareas
class TaskFactory {
  static createTask(data) {
    return {
      id: Date.now() + Math.random(),
      title: data.title,
      description: data.description || '',
      completed: false,
      priority: data.priority || 'medium',
      dueDate: data.dueDate || null,
      tags: data.tags || [],
      createdAt: new Date().toISOString(),
      completedAt: null,
      estimatedTime: data.estimatedTime || null
    };
  }
}

// 3. OBSERVER PATTERN: Sistema de notificaciones
class NotificationService {
  constructor() {
    this.observers = [];
  }
  
  subscribe(callback) {
    this.observers.push(callback);
  }
  
  notify(message, type = 'info') {
    this.observers.forEach(callback => callback({ message, type, timestamp: Date.now() }));
  }
}

// 4. REDUCER PATTERN: Gestión de estado
const initialState = {
  tasks: [],
  history: [],
  filters: {
    status: 'all', // all, active, completed
    priority: 'all',
    search: '',
    dateRange: 'all' // all, today, week
  },
  showFilters: false,
  showHelp: false,
  showSettings: false,
  tutorial: {
    active: false,
    step: 0
  },
  notifications: [],
  stats: {
    totalTasks: 0,
    completedTasks: 0,
    productivityScore: 0,
    streak: 0
  },
  settings: {
    sortBy: 'priority', // priority, date, created
    showCompleted: true,
    animations: true,
    autoArchive: false
  }
};

function appReducer(state, action) {
  switch (action.type) {
    case 'ADD_TASK':
      return {
        ...state,
        tasks: [...state.tasks, action.payload],
        history: [...state.history, { action: 'add', task: action.payload, timestamp: Date.now() }],
        stats: {
          ...state.stats,
          totalTasks: state.stats.totalTasks + 1
        }
      };
      
    case 'UPDATE_TASK':
      return {
        ...state,
        tasks: state.tasks.map(t => t.id === action.payload.id ? action.payload : t),
        history: [...state.history, { action: 'update', task: action.payload, timestamp: Date.now() }]
      };
      
    case 'DELETE_TASK':
      return {
        ...state,
        tasks: state.tasks.filter(t => t.id !== action.payload),
        history: [...state.history, { action: 'delete', taskId: action.payload, timestamp: Date.now() }]
      };
      
    case 'TOGGLE_TASK':
      const toggledTask = state.tasks.find(t => t.id === action.payload);
      const newCompleted = !toggledTask.completed;
      return {
        ...state,
        tasks: state.tasks.map(t => 
          t.id === action.payload 
            ? { ...t, completed: newCompleted, completedAt: newCompleted ? new Date().toISOString() : null }
            : t
        ),
        history: [...state.history, { action: 'toggle', taskId: action.payload, timestamp: Date.now() }],
        stats: {
          ...state.stats,
          completedTasks: newCompleted ? state.stats.completedTasks + 1 : state.stats.completedTasks - 1
        }
      };
      
    case 'UNDO':
      if (state.history.length === 0) return state;
      const lastAction = state.history[state.history.length - 1];
      let newTasks = [...state.tasks];
      
      if (lastAction.action === 'add') {
        newTasks = newTasks.filter(t => t.id !== lastAction.task.id);
      } else if (lastAction.action === 'delete') {
        // Cannot undo delete without storing the task
      } else if (lastAction.action === 'toggle') {
        newTasks = newTasks.map(t => 
          t.id === lastAction.taskId ? { ...t, completed: !t.completed } : t
        );
      }
      
      return {
        ...state,
        tasks: newTasks,
        history: state.history.slice(0, -1)
      };
      
    case 'UPDATE_FILTERS':
      return {
        ...state,
        filters: { ...state.filters, ...action.payload }
      };
      
    case 'TOGGLE_FILTERS':
      return {
        ...state,
        showFilters: !state.showFilters
      };
      
    case 'TOGGLE_HELP':
      return {
        ...state,
        showHelp: !state.showHelp
      };
      
    case 'TOGGLE_SETTINGS':
      return {
        ...state,
        showSettings: !state.showSettings
      };
      
    case 'UPDATE_SETTINGS':
      return {
        ...state,
        settings: { ...state.settings, ...action.payload }
      };
      
    case 'START_TUTORIAL':
      return {
        ...state,
        tutorial: { active: true, step: 0 }
      };
      
    case 'NEXT_TUTORIAL_STEP':
      return {
        ...state,
        tutorial: { ...state.tutorial, step: state.tutorial.step + 1 }
      };
      
    case 'END_TUTORIAL':
      return {
        ...state,
        tutorial: { active: false, step: 0 }
      };
      
    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [...state.notifications, action.payload]
      };
      
    case 'REMOVE_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter(n => n.timestamp !== action.payload)
      };
      
    case 'LOAD_TASKS':
      return {
        ...state,
        tasks: action.payload
      };
      
    default:
      return state;
  }
}

// ============================================
// COMPONENTES
// ============================================

// Tooltip Component (Nielsen: Help and Documentation)
const Tooltip = ({ children, text, position = 'top' }) => {
  const [show, setShow] = useState(false);
  
  return (
    <div 
      className="tooltip-wrapper"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className={`tooltip tooltip-${position}`}>
          {text}
        </div>
      )}
    </div>
  );
};

// Notification Component (Nielsen: Visibility of System Status)
const Notification = ({ notification, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(notification.timestamp);
    }, 3000);
    
    return () => clearTimeout(timer);
  }, [notification, onClose]);
  
  const icons = {
    success: <Check size={18} />,
    error: <X size={18} />,
    info: <Info size={18} />,
    warning: <AlertCircle size={18} />
  };
  
  return (
    <div className={`notification notification-${notification.type}`}>
      <span className="notification-icon">{icons[notification.type]}</span>
      <span className="notification-message">{notification.message}</span>
    </div>
  );
};

// Tutorial Component
const Tutorial = ({ step, onNext, onEnd }) => {
  const steps = [
    {
      title: "¡Bienvenido a TaskFlow!",
      content: "Gestiona tus tareas con inteligencia. Te mostramos cómo funciona.",
    },
    {
      title: "Crear Tareas",
      content: "Usa el botón + para agregar nuevas tareas. Puedes añadir prioridad, fecha límite y tags.",
    },
    {
      title: "Prioridad Inteligente",
      content: "Las tareas se ordenan automáticamente por urgencia, fecha límite y prioridad manual.",
    },
    {
      title: "Filtros Poderosos",
      content: "Filtra por estado, prioridad, fecha o busca por texto. Encuentra lo que necesitas al instante.",
    },
    {
      title: "Estadísticas en Tiempo Real",
      content: "Visualiza tu progreso, racha de productividad y métricas importantes.",
    }
  ];
  
  const currentStep = steps[step];
  
  if (step >= steps.length) {
    onEnd();
    return null;
  }
  
  return (
    <div className="tutorial-overlay" onClick={onEnd}>
      <div className="tutorial-card" onClick={e => e.stopPropagation()}>
        <div className="tutorial-header">
          <BookOpen size={24} />
          <span className="tutorial-step">Paso {step + 1} de {steps.length}</span>
        </div>
        <h3>{currentStep.title}</h3>
        <p>{currentStep.content}</p>
        <div className="tutorial-actions">
          {step < steps.length - 1 ? (
            <>
              <button onClick={onEnd} className="tutorial-skip">Saltar</button>
              <button onClick={onNext} className="tutorial-next">
                Siguiente <ChevronRight size={18} />
              </button>
            </>
          ) : (
            <button onClick={onEnd} className="tutorial-finish">
              ¡Empezar a trabajar!
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Filters Panel
const FiltersPanel = ({ filters, onUpdate, onClose }) => {
  const [localFilters, setLocalFilters] = useState(filters);
  
  const handleApply = () => {
    onUpdate(localFilters);
    onClose();
  };
  
  return (
    <div className="filters-overlay" onClick={onClose}>
      <div className="filters-panel" onClick={e => e.stopPropagation()}>
        <div className="filters-header">
          <h3><Filter size={20} /> Filtros</h3>
          <button onClick={onClose} className="close-btn">✕</button>
        </div>
        
        <div className="filters-content">
          <div className="filter-group">
            <label>Estado</label>
            <select 
              value={localFilters.status}
              onChange={e => setLocalFilters({...localFilters, status: e.target.value})}
            >
              <option value="all">Todas</option>
              <option value="active">Activas</option>
              <option value="completed">Completadas</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Prioridad</label>
            <select 
              value={localFilters.priority}
              onChange={e => setLocalFilters({...localFilters, priority: e.target.value})}
            >
              <option value="all">Todas</option>
              <option value="urgent">Urgente</option>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Fecha</label>
            <select 
              value={localFilters.dateRange}
              onChange={e => setLocalFilters({...localFilters, dateRange: e.target.value})}
            >
              <option value="all">Todas</option>
              <option value="today">Hoy</option>
              <option value="week">Esta semana</option>
            </select>
          </div>
          
          <p className="filter-info">
            <Info size={16} />
            Los filtros te ayudan a enfocarte en lo importante.
          </p>
        </div>
        
        <div className="filters-actions">
          <button onClick={() => setLocalFilters(initialState.filters)} className="reset-btn">
            Restablecer
          </button>
          <button onClick={handleApply} className="apply-btn">
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
};

// Settings Panel
const SettingsPanel = ({ settings, onUpdate, onClose }) => {
  const [localSettings, setLocalSettings] = useState(settings);
  
  const handleSave = () => {
    onUpdate(localSettings);
    onClose();
  };
  
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h3><Settings size={20} /> Configuración</h3>
          <button onClick={onClose} className="close-btn">✕</button>
        </div>
        
        <div className="settings-content">
          <div className="setting-item">
            <div className="setting-info">
              <label>Ordenar por</label>
              <p>Criterio de ordenamiento predeterminado</p>
            </div>
            <select 
              value={localSettings.sortBy}
              onChange={e => setLocalSettings({...localSettings, sortBy: e.target.value})}
            >
              <option value="priority">Prioridad</option>
              <option value="date">Fecha límite</option>
              <option value="created">Fecha de creación</option>
            </select>
          </div>
          
          <div className="setting-item">
            <div className="setting-info">
              <label>Mostrar completadas</label>
              <p>Incluir tareas completadas en la lista</p>
            </div>
            <label className="toggle">
              <input 
                type="checkbox" 
                checked={localSettings.showCompleted}
                onChange={e => setLocalSettings({...localSettings, showCompleted: e.target.checked})}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          
          <div className="setting-item">
            <div className="setting-info">
              <label>Animaciones</label>
              <p>Efectos visuales y transiciones</p>
            </div>
            <label className="toggle">
              <input 
                type="checkbox" 
                checked={localSettings.animations}
                onChange={e => setLocalSettings({...localSettings, animations: e.target.checked})}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          
          <div className="setting-item">
            <div className="setting-info">
              <label>Auto-archivar</label>
              <p>Archivar tareas completadas después de 7 días</p>
            </div>
            <label className="toggle">
              <input 
                type="checkbox" 
                checked={localSettings.autoArchive}
                onChange={e => setLocalSettings({...localSettings, autoArchive: e.target.checked})}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>
        
        <div className="filters-actions">
          <button onClick={onClose} className="reset-btn">
            Cancelar
          </button>
          <button onClick={handleSave} className="apply-btn">
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

// Help Panel
const HelpPanel = ({ onClose, onStartTutorial }) => {
  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-panel" onClick={e => e.stopPropagation()}>
        <div className="help-header">
          <h3><HelpCircle size={20} /> Centro de ayuda</h3>
          <button onClick={onClose} className="close-btn">✕</button>
        </div>
        
        <div className="help-content">
          <div className="help-section">
            <h4>¿Cómo funciona la priorización?</h4>
            <p>TaskFlow usa un sistema inteligente que considera:</p>
            <ul>
              <li><strong>Prioridad manual:</strong> Tu clasificación (baja/media/alta/urgente)</li>
              <li><strong>Fecha límite:</strong> Qué tan cerca está el deadline</li>
              <li><strong>Tags:</strong> Etiquetas como "urgent" o "important"</li>
            </ul>
          </div>
          
          <div className="help-section">
            <h4>Atajos de teclado</h4>
            <ul>
              <li><kbd>N</kbd> Nueva tarea</li>
              <li><kbd>Ctrl + Z</kbd> Deshacer</li>
              <li><kbd>F</kbd> Abrir filtros</li>
              <li><kbd>/</kbd> Buscar</li>
              <li><kbd>?</kbd> Mostrar ayuda</li>
            </ul>
          </div>
          
          <div className="help-section">
            <h4>Niveles de prioridad</h4>
            <ul>
              <li><span className="priority-badge urgent">Urgente</span> - Máxima prioridad</li>
              <li><span className="priority-badge high">Alta</span> - Importante y próxima</li>
              <li><span className="priority-badge medium">Media</span> - Prioridad normal</li>
              <li><span className="priority-badge low">Baja</span> - Puede esperar</li>
            </ul>
          </div>
          
          <button onClick={onStartTutorial} className="tutorial-btn">
            <BookOpen size={18} />
            Ver tutorial interactivo
          </button>
        </div>
      </div>
    </div>
  );
};

// Stats Component (Nielsen: Visibility of System Status)
const StatsBar = ({ stats, tasks }) => {
  const activeTasks = tasks.filter(t => !t.completed).length;
  const completionRate = stats.totalTasks > 0 
    ? Math.round((stats.completedTasks / stats.totalTasks) * 100) 
    : 0;
  
  return (
    <div className="stats-bar">
      <div className="stat-item">
        <Target size={16} />
        <span>{activeTasks} activas</span>
      </div>
      <div className="stat-item highlight">
        <Check size={16} />
        <span>{stats.completedTasks} completadas</span>
      </div>
      <div className="stat-item">
        <TrendingUp size={16} />
        <span>{completionRate}% progreso</span>
      </div>
    </div>
  );
};

// Task Form Component
const TaskForm = ({ onAdd, onCancel, editTask, onUpdate }) => {
  const [formData, setFormData] = useState(editTask || {
    title: '',
    description: '',
    priority: 'medium',
    dueDate: '',
    tags: [],
    estimatedTime: ''
  });
  const [tagInput, setTagInput] = useState('');
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    
    if (editTask) {
      onUpdate({ ...editTask, ...formData });
    } else {
      onAdd(formData);
    }
  };
  
  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({ ...formData, tags: [...formData.tags, tagInput.trim()] });
      setTagInput('');
    }
  };
  
  const handleRemoveTag = (tag) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) });
  };
  
  return (
    <div className="task-form-overlay" onClick={onCancel}>
      <form className="task-form" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="form-header">
          <h3>{editTask ? 'Editar Tarea' : 'Nueva Tarea'}</h3>
          <button type="button" onClick={onCancel} className="close-btn">✕</button>
        </div>
        
        <div className="form-content">
          <div className="form-group">
            <label>Título *</label>
            <input 
              type="text"
              placeholder="¿Qué necesitas hacer?"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              autoFocus
              required
            />
          </div>
          
          <div className="form-group">
            <label>Descripción</label>
            <textarea 
              placeholder="Detalles adicionales..."
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Prioridad</label>
              <select 
                value={formData.priority}
                onChange={e => setFormData({ ...formData, priority: e.target.value })}
              >
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Fecha límite</label>
              <input 
                type="date"
                value={formData.dueDate}
                onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
              />
            </div>
          </div>
          
          <div className="form-group">
            <label>Tags</label>
            <div className="tag-input-container">
              <input 
                type="text"
                placeholder="Añadir tag..."
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
              />
              <button type="button" onClick={handleAddTag} className="add-tag-btn">
                <Plus size={16} />
              </button>
            </div>
            {formData.tags.length > 0 && (
              <div className="tags-list">
                {formData.tags.map(tag => (
                  <span key={tag} className="tag">
                    {tag}
                    <button type="button" onClick={() => handleRemoveTag(tag)}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="form-actions">
          <button type="button" onClick={onCancel} className="cancel-btn">
            Cancelar
          </button>
          <button type="submit" className="submit-btn">
            {editTask ? 'Actualizar' : 'Crear tarea'}
          </button>
        </div>
      </form>
    </div>
  );
};

// Task Item Component
const TaskItem = ({ task, onToggle, onEdit, onDelete, priorityScore }) => {
  const [showActions, setShowActions] = useState(false);
  
  const getPriorityColor = (priority) => {
    const colors = {
      urgent: '#ef4444',
      high: '#f59e0b',
      medium: '#8b5cf6',
      low: '#6b7280'
    };
    return colors[priority] || colors.medium;
  };
  
  const formatDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const today = new Date();
    const diffDays = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return <span className="date-badge overdue">Vencida</span>;
    if (diffDays === 0) return <span className="date-badge today">Hoy</span>;
    if (diffDays === 1) return <span className="date-badge tomorrow">Mañana</span>;
    return <span className="date-badge">{date.toLocaleDateString()}</span>;
  };
  
  return (
    <div 
      className={`task-item ${task.completed ? 'completed' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="task-checkbox-container">
        <Tooltip text={task.completed ? "Marcar como pendiente" : "Marcar como completada"}>
          <button 
            className="task-checkbox"
            onClick={() => onToggle(task.id)}
            aria-label={task.completed ? "Desmarcar tarea" : "Completar tarea"}
          >
            {task.completed && <Check size={16} />}
          </button>
        </Tooltip>
      </div>
      
      <div className="task-content">
        <div className="task-header-row">
          <h4 className="task-title">{task.title}</h4>
          {priorityScore > 5 && !task.completed && (
            <Tooltip text={`Prioridad calculada: ${priorityScore}/10`}>
              <div className="priority-score">
                <Zap size={14} />
                <span>{priorityScore}</span>
              </div>
            </Tooltip>
          )}
        </div>
        
        {task.description && (
          <p className="task-description">{task.description}</p>
        )}
        
        <div className="task-meta">
          <span 
            className="priority-badge" 
            style={{ backgroundColor: getPriorityColor(task.priority) }}
          >
            {task.priority === 'urgent' && 'Urgente'}
            {task.priority === 'high' && 'Alta'}
            {task.priority === 'medium' && 'Media'}
            {task.priority === 'low' && 'Baja'}
          </span>
          
          {task.dueDate && formatDate(task.dueDate)}
          
          {task.tags.map(tag => (
            <span key={tag} className="tag-badge">{tag}</span>
          ))}
        </div>
      </div>
      
      {showActions && !task.completed && (
        <div className="task-actions">
          <Tooltip text="Editar tarea">
            <button 
              className="action-btn edit-btn"
              onClick={() => onEdit(task)}
              aria-label="Editar tarea"
            >
              <Edit2 size={16} />
            </button>
          </Tooltip>
          <Tooltip text="Eliminar tarea">
            <button 
              className="action-btn delete-btn"
              onClick={() => onDelete(task.id)}
              aria-label="Eliminar tarea"
            >
              <Trash2 size={16} />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function TaskFlow() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const taskService = TaskService.getInstance();
  const notificationService = new NotificationService();
  
  // LocalStorage persistence
  useEffect(() => {
    const savedTasks = localStorage.getItem('taskflow_tasks');
    if (savedTasks) {
      dispatch({ type: 'LOAD_TASKS', payload: JSON.parse(savedTasks) });
    }
  }, []);
  
  useEffect(() => {
    localStorage.setItem('taskflow_tasks', JSON.stringify(state.tasks));
  }, [state.tasks]);
  
  // Subscribe to notifications
  useEffect(() => {
    notificationService.subscribe((notification) => {
      dispatch({ type: 'ADD_NOTIFICATION', payload: notification });
    });
  }, []);
  
  // Tutorial on first load
  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('taskflow_tutorial_seen');
    if (!hasSeenTutorial) {
      dispatch({ type: 'START_TUTORIAL' });
      localStorage.setItem('taskflow_tutorial_seen', 'true');
    }
  }, []);
  
  // Keyboard shortcuts (Nielsen: Flexibility and Efficiency)
  useEffect(() => {
    const handleKeyPress = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
      if (e.key === 'n' || e.key === 'N') {
        if (!showTaskForm && !state.showFilters && !state.showSettings && !state.showHelp) {
          e.preventDefault();
          setShowTaskForm(true);
        }
      }
      if (e.key === 'f' || e.key === 'F') {
        if (!showTaskForm) {
          e.preventDefault();
          dispatch({ type: 'TOGGLE_FILTERS' });
        }
      }
      if (e.key === '/') {
        if (!showTaskForm) {
          e.preventDefault();
          document.querySelector('.search-input')?.focus();
        }
      }
      if (e.key === '?') {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_HELP' });
      }
      if (e.key === 'Escape') {
        setShowTaskForm(false);
        setEditingTask(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [showTaskForm, state.showFilters, state.showSettings, state.showHelp, state.history]);
  
  // Filtered and sorted tasks
  const displayedTasks = useMemo(() => {
    let filtered = taskService.filterTasks(state.tasks, state.filters);
    
    if (!state.settings.showCompleted) {
      filtered = filtered.filter(t => !t.completed);
    }
    
    if (state.settings.sortBy === 'priority') {
      return taskService.sortByPriority(filtered);
    } else if (state.settings.sortBy === 'date') {
      return filtered.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });
    } else {
      return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
  }, [state.tasks, state.filters, state.settings, taskService]);
  
  const handleAddTask = (taskData) => {
    const newTask = TaskFactory.createTask(taskData);
    dispatch({ type: 'ADD_TASK', payload: newTask });
    setShowTaskForm(false);
    notificationService.notify('Tarea creada exitosamente ✓', 'success');
  };
  
  const handleUpdateTask = (updatedTask) => {
    dispatch({ type: 'UPDATE_TASK', payload: updatedTask });
    setEditingTask(null);
    notificationService.notify('Tarea actualizada ✓', 'success');
  };
  
  const handleToggleTask = (taskId) => {
    dispatch({ type: 'TOGGLE_TASK', payload: taskId });
    const task = state.tasks.find(t => t.id === taskId);
    if (!task.completed) {
      notificationService.notify('¡Tarea completada! 🎉', 'success');
    }
  };
  
  const handleDeleteTask = (taskId) => {
    if (confirm('¿Estás seguro de eliminar esta tarea?')) {
      dispatch({ type: 'DELETE_TASK', payload: taskId });
      notificationService.notify('Tarea eliminada', 'info');
    }
  };
  
  const handleEditTask = (task) => {
    setEditingTask(task);
  };
  
  const handleUndo = () => {
    if (state.history.length > 0) {
      dispatch({ type: 'UNDO' });
      notificationService.notify('Acción deshecha ↩️', 'info');
    } else {
      notificationService.notify('No hay acciones para deshacer', 'warning');
    }
  };
  
  const handleSearchChange = (search) => {
    dispatch({ type: 'UPDATE_FILTERS', payload: { search } });
  };
  
  return (
    <div className="taskflow-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Outfit:wght@400;500;600;700;800&display=swap');
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Outfit', sans-serif;
          background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #2d1b3d 100%);
          min-height: 100vh;
          color: #fff;
        }
        
        .taskflow-app {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px;
          position: relative;
          overflow: hidden;
        }
        
        .taskflow-app::before {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%);
          animation: rotate 30s linear infinite;
          pointer-events: none;
        }
        
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        header {
          text-align: center;
          margin-bottom: 20px;
          z-index: 1;
          width: 100%;
          max-width: 800px;
        }
        
        h1 {
          font-size: 2.8rem;
          font-weight: 800;
          background: linear-gradient(135deg, #a78bfa 0%, #ec4899 50%, #f59e0b 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 8px;
          text-shadow: 0 0 60px rgba(167, 139, 250, 0.5);
          font-family: 'JetBrains Mono', monospace;
        }
        
        .tagline {
          font-size: 1rem;
          color: #a78bfa;
          font-weight: 500;
        }
        
        .top-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          max-width: 800px;
          margin-bottom: 20px;
          z-index: 1;
          gap: 15px;
        }
        
        .search-container {
          flex: 1;
          position: relative;
        }
        
        .search-input {
          width: 100%;
          padding: 12px 40px 12px 40px;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(167, 139, 250, 0.3);
          border-radius: 12px;
          color: #fff;
          font-size: 0.95rem;
          outline: none;
          transition: all 0.3s ease;
        }
        
        .search-input:focus {
          border-color: rgba(167, 139, 250, 0.6);
          background: rgba(255, 255, 255, 0.08);
        }
        
        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #a78bfa;
        }
        
        .controls-right {
          display: flex;
          gap: 10px;
        }
        
        .control-btn {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          border: 1px solid rgba(167, 139, 250, 0.3);
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          color: #a78bfa;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
        }
        
        .control-btn:hover {
          background: rgba(167, 139, 250, 0.2);
          border-color: rgba(167, 139, 250, 0.5);
          transform: translateY(-2px);
        }
        
        .control-btn:active {
          transform: translateY(0);
        }
        
        .control-btn.disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        
        .control-btn.disabled:hover {
          transform: none;
          background: rgba(255, 255, 255, 0.05);
        }
        
        .add-task-btn {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
          border: none;
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 0 10px 30px rgba(139, 92, 246, 0.4);
        }
        
        .add-task-btn:hover {
          transform: scale(1.1);
          box-shadow: 0 15px 40px rgba(139, 92, 246, 0.6);
        }
        
        .add-task-btn:active {
          transform: scale(0.95);
        }
        
        .stats-bar {
          display: flex;
          gap: 15px;
          justify-content: center;
          width: 100%;
          max-width: 800px;
          margin-bottom: 25px;
          z-index: 1;
        }
        
        .stat-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          border-radius: 12px;
          border: 1px solid rgba(167, 139, 250, 0.2);
          font-size: 0.9rem;
          color: #cbd5e1;
          font-weight: 500;
        }
        
        .stat-item.highlight {
          background: rgba(139, 92, 246, 0.15);
          border-color: rgba(139, 92, 246, 0.4);
          color: #c4b5fd;
          font-weight: 600;
        }
        
        .stat-item svg {
          color: #8b5cf6;
        }
        
        .tasks-container {
          width: 100%;
          max-width: 800px;
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(20px);
          border-radius: 24px;
          border: 1px solid rgba(167, 139, 250, 0.2);
          padding: 30px;
          min-height: 400px;
          z-index: 1;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }
        
        .tasks-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .task-item {
          display: flex;
          align-items: flex-start;
          gap: 15px;
          padding: 18px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          border: 1px solid rgba(167, 139, 250, 0.15);
          transition: all 0.3s ease;
          position: relative;
        }
        
        .task-item:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(167, 139, 250, 0.3);
          transform: translateX(4px);
        }
        
        .task-item.completed {
          opacity: 0.6;
        }
        
        .task-item.completed .task-title {
          text-decoration: line-through;
          color: #94a3b8;
        }
        
        .task-checkbox-container {
          flex-shrink: 0;
        }
        
        .task-checkbox {
          width: 24px;
          height: 24px;
          border-radius: 8px;
          border: 2px solid rgba(167, 139, 250, 0.4);
          background: rgba(255, 255, 255, 0.05);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
        }
        
        .task-checkbox:hover {
          border-color: rgba(167, 139, 250, 0.8);
          background: rgba(167, 139, 250, 0.1);
        }
        
        .task-item.completed .task-checkbox {
          background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
          border-color: transparent;
        }
        
        .task-checkbox svg {
          color: white;
        }
        
        .task-content {
          flex: 1;
          min-width: 0;
        }
        
        .task-header-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 6px;
        }
        
        .task-title {
          font-size: 1.05rem;
          font-weight: 600;
          color: #fff;
          margin: 0;
        }
        
        .priority-score {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(239, 68, 68, 0.2) 100%);
          border: 1px solid rgba(245, 158, 11, 0.4);
          border-radius: 8px;
          font-size: 0.75rem;
          font-weight: 700;
          color: #fbbf24;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .priority-score svg {
          color: #fbbf24;
        }
        
        .task-description {
          font-size: 0.9rem;
          color: #cbd5e1;
          margin: 6px 0 10px;
          line-height: 1.5;
        }
        
        .task-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        
        .priority-badge {
          padding: 4px 12px;
          border-radius: 8px;
          font-size: 0.75rem;
          font-weight: 600;
          color: white;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .date-badge {
          padding: 4px 10px;
          background: rgba(167, 139, 250, 0.15);
          border: 1px solid rgba(167, 139, 250, 0.3);
          border-radius: 8px;
          font-size: 0.75rem;
          color: #c4b5fd;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        .date-badge.overdue {
          background: rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.4);
          color: #fca5a5;
        }
        
        .date-badge.today {
          background: rgba(245, 158, 11, 0.15);
          border-color: rgba(245, 158, 11, 0.4);
          color: #fcd34d;
        }
        
        .date-badge.tomorrow {
          background: rgba(34, 197, 94, 0.15);
          border-color: rgba(34, 197, 94, 0.4);
          color: #86efac;
        }
        
        .tag-badge {
          padding: 4px 10px;
          background: rgba(236, 72, 153, 0.15);
          border: 1px solid rgba(236, 72, 153, 0.3);
          border-radius: 8px;
          font-size: 0.75rem;
          color: #fbcfe8;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .task-actions {
          display: flex;
          gap: 6px;
          position: absolute;
          right: 18px;
          top: 18px;
        }
        
        .action-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid rgba(167, 139, 250, 0.3);
          background: rgba(255, 255, 255, 0.05);
          color: #a78bfa;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }
        
        .action-btn:hover {
          background: rgba(167, 139, 250, 0.2);
          border-color: rgba(167, 139, 250, 0.5);
        }
        
        .action-btn.delete-btn:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.5);
          color: #fca5a5;
        }
        
        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: #94a3b8;
        }
        
        .empty-state-icon {
          width: 80px;
          height: 80px;
          margin: 0 auto 20px;
          background: rgba(167, 139, 250, 0.1);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #a78bfa;
        }
        
        .empty-state h3 {
          font-size: 1.3rem;
          color: #cbd5e1;
          margin-bottom: 10px;
        }
        
        .empty-state p {
          font-size: 0.95rem;
        }
        
        /* Tooltip */
        .tooltip-wrapper {
          position: relative;
          display: inline-block;
        }
        
        .tooltip {
          position: absolute;
          background: rgba(0, 0, 0, 0.95);
          color: white;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 0.8rem;
          white-space: nowrap;
          z-index: 1000;
          pointer-events: none;
          animation: fadeIn 0.2s ease;
          border: 1px solid rgba(167, 139, 250, 0.3);
        }
        
        .tooltip-top {
          bottom: calc(100% + 10px);
          left: 50%;
          transform: translateX(-50%);
        }
        
        .tooltip-bottom {
          top: calc(100% + 10px);
          left: 50%;
          transform: translateX(-50%);
        }
        
        /* Notifications */
        .notifications-container {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 2000;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        
        .notification {
          background: rgba(0, 0, 0, 0.9);
          backdrop-filter: blur(10px);
          padding: 12px 20px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid;
          animation: slideInRight 0.3s ease;
          min-width: 250px;
        }
        
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        .notification-success {
          border-color: #22c55e;
        }
        
        .notification-success .notification-icon {
          color: #22c55e;
        }
        
        .notification-error {
          border-color: #ef4444;
        }
        
        .notification-error .notification-icon {
          color: #ef4444;
        }
        
        .notification-info {
          border-color: #3b82f6;
        }
        
        .notification-info .notification-icon {
          color: #3b82f6;
        }
        
        .notification-warning {
          border-color: #f59e0b;
        }
        
        .notification-warning .notification-icon {
          color: #f59e0b;
        }
        
        .notification-message {
          font-size: 0.9rem;
          font-weight: 500;
          color: #fff;
        }
        
        /* Modal overlays */
        .task-form-overlay, .filters-overlay, .settings-overlay, .help-overlay, .tutorial-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.3s ease;
          backdrop-filter: blur(10px);
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .task-form, .filters-panel, .settings-panel, .help-panel, .tutorial-card {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(236, 72, 153, 0.1) 100%);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(167, 139, 250, 0.3);
          border-radius: 24px;
          padding: 30px;
          max-width: 550px;
          width: 90%;
          animation: popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
          max-height: 85vh;
          overflow-y: auto;
        }
        
        @keyframes popIn {
          from {
            transform: scale(0.8);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        
        .form-header, .filters-header, .settings-header, .help-header, .tutorial-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 25px;
        }
        
        .form-header h3, .filters-header h3, .settings-header h3, .help-header h3 {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 1.4rem;
          color: #fff;
        }
        
        .close-btn {
          background: none;
          border: none;
          color: #cbd5e1;
          font-size: 1.5rem;
          cursor: pointer;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: all 0.2s ease;
        }
        
        .close-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
        
        .form-content, .filters-content, .settings-content, .help-content {
          margin-bottom: 25px;
        }
        
        .form-group {
          margin-bottom: 20px;
        }
        
        .form-group label {
          display: block;
          color: #a78bfa;
          font-weight: 600;
          margin-bottom: 8px;
          font-size: 0.9rem;
        }
        
        .form-group input[type="text"],
        .form-group input[type="date"],
        .form-group textarea,
        .form-group select,
        .filter-group select,
        .setting-item select {
          width: 100%;
          padding: 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(167, 139, 250, 0.3);
          border-radius: 12px;
          color: #fff;
          font-size: 0.95rem;
          font-family: 'Outfit', sans-serif;
          outline: none;
          transition: all 0.3s ease;
        }
        
        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
          border-color: rgba(167, 139, 250, 0.6);
          background: rgba(255, 255, 255, 0.08);
        }
        
        .form-group textarea {
          resize: vertical;
        }
        
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }
        
        .tag-input-container {
          display: flex;
          gap: 8px;
        }
        
        .tag-input-container input {
          flex: 1;
        }
        
        .add-tag-btn {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background: rgba(167, 139, 250, 0.2);
          border: 1px solid rgba(167, 139, 250, 0.4);
          color: #c4b5fd;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }
        
        .add-tag-btn:hover {
          background: rgba(167, 139, 250, 0.3);
        }
        
        .tags-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }
        
        .tags-list .tag {
          padding: 6px 12px;
          background: rgba(236, 72, 153, 0.2);
          border: 1px solid rgba(236, 72, 153, 0.4);
          border-radius: 8px;
          color: #fbcfe8;
          font-size: 0.85rem;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .tags-list .tag button {
          background: none;
          border: none;
          color: #fbcfe8;
          cursor: pointer;
          display: flex;
          padding: 0;
          margin: 0;
        }
        
        .form-actions, .filters-actions {
          display: flex;
          gap: 10px;
        }
        
        .cancel-btn, .reset-btn {
          flex: 1;
          padding: 14px;
          background: rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          border: 1px solid rgba(167, 139, 250, 0.3);
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        
        .cancel-btn:hover, .reset-btn:hover {
          background: rgba(255, 255, 255, 0.15);
        }
        
        .submit-btn, .apply-btn {
          flex: 1;
          padding: 14px;
          background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        
        .submit-btn:hover, .apply-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(139, 92, 246, 0.4);
        }
        
        /* Settings */
        .filter-group, .setting-item {
          margin-bottom: 20px;
        }
        
        .filter-group label {
          display: block;
          color: #a78bfa;
          font-weight: 600;
          margin-bottom: 8px;
          font-size: 0.9rem;
        }
        
        .setting-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 12px;
          border: 1px solid rgba(167, 139, 250, 0.1);
        }
        
        .setting-info label {
          display: block;
          color: #fff;
          font-weight: 600;
          margin-bottom: 4px;
        }
        
        .setting-info p {
          color: #94a3b8;
          font-size: 0.85rem;
        }
        
        .toggle {
          position: relative;
          display: inline-block;
          width: 50px;
          height: 26px;
        }
        
        .toggle input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        
        .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(167, 139, 250, 0.3);
          transition: 0.3s;
          border-radius: 26px;
        }
        
        .toggle-slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background: white;
          transition: 0.3s;
          border-radius: 50%;
        }
        
        .toggle input:checked + .toggle-slider {
          background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
          border-color: transparent;
        }
        
        .toggle input:checked + .toggle-slider:before {
          transform: translateX(24px);
        }
        
        .filter-info {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.3);
          border-radius: 12px;
          color: #93c5fd;
          font-size: 0.85rem;
        }
        
        /* Help */
        .help-section {
          margin-bottom: 25px;
        }
        
        .help-section h4 {
          color: #a78bfa;
          font-size: 1rem;
          margin-bottom: 12px;
        }
        
        .help-section p {
          color: #cbd5e1;
          line-height: 1.6;
          margin-bottom: 10px;
        }
        
        .help-section ul {
          list-style: none;
          padding: 0;
        }
        
        .help-section li {
          color: #cbd5e1;
          padding: 8px 0;
          padding-left: 20px;
          position: relative;
        }
        
        .help-section li:before {
          content: "→";
          position: absolute;
          left: 0;
          color: #ec4899;
        }
        
        kbd {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(167, 139, 250, 0.3);
          border-radius: 6px;
          padding: 2px 8px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.85rem;
          color: #c4b5fd;
        }
        
        .tutorial-btn {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
          border: none;
          border-radius: 12px;
          color: white;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.3s ease;
          margin-top: 20px;
        }
        
        .tutorial-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(139, 92, 246, 0.4);
        }
        
        /* Tutorial */
        .tutorial-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        
        .tutorial-header svg {
          color: #a78bfa;
        }
        
        .tutorial-step {
          color: #94a3b8;
          font-size: 0.85rem;
          font-weight: 600;
        }
        
        .tutorial-card h3 {
          font-size: 1.5rem;
          color: #fff;
          margin-bottom: 15px;
        }
        
        .tutorial-card p {
          color: #cbd5e1;
          line-height: 1.6;
          margin-bottom: 25px;
        }
        
        .tutorial-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }
        
        .tutorial-skip, .tutorial-next, .tutorial-finish {
          padding: 12px 24px;
          border: none;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .tutorial-skip {
          background: rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          border: 1px solid rgba(167, 139, 250, 0.3);
        }
        
        .tutorial-skip:hover {
          background: rgba(255, 255, 255, 0.15);
        }
        
        .tutorial-next, .tutorial-finish {
          background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
          color: white;
        }
        
        .tutorial-next:hover, .tutorial-finish:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(139, 92, 246, 0.4);
        }
        
        @media (max-width: 768px) {
          h1 {
            font-size: 2rem;
          }
          
          .top-controls {
            flex-direction: column;
          }
          
          .search-container {
            width: 100%;
          }
          
          .form-row {
            grid-template-columns: 1fr;
          }
          
          .tasks-container {
            padding: 20px;
          }
        }
      `}</style>
      
      <header>
        <h1>&lt;TaskFlow /&gt;</h1>
        <p className="tagline">Gestión inteligente de tareas con priorización automática</p>
      </header>
      
      <div className="top-controls">
        <div className="search-container">
          <Search className="search-icon" size={18} />
          <input 
            type="text"
            className="search-input"
            placeholder="Buscar tareas... (presiona /)"
            value={state.filters.search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        
        <div className="controls-right">
          <Tooltip text="Deshacer (Ctrl+Z)">
            <button 
              className={`control-btn ${state.history.length === 0 ? 'disabled' : ''}`}
              onClick={handleUndo}
              disabled={state.history.length === 0}
              aria-label="Deshacer"
            >
              <Undo2 size={20} />
            </button>
          </Tooltip>
          
          <Tooltip text="Filtros (F)">
            <button 
              className="control-btn"
              onClick={() => dispatch({ type: 'TOGGLE_FILTERS' })}
              aria-label="Abrir filtros"
            >
              <Filter size={20} />
            </button>
          </Tooltip>
          
          <Tooltip text="Configuración">
            <button 
              className="control-btn"
              onClick={() => dispatch({ type: 'TOGGLE_SETTINGS' })}
              aria-label="Abrir configuración"
            >
              <Settings size={20} />
            </button>
          </Tooltip>
          
          <Tooltip text="Ayuda (?)">
            <button 
              className="control-btn"
              onClick={() => dispatch({ type: 'TOGGLE_HELP' })}
              aria-label="Abrir ayuda"
            >
              <HelpCircle size={20} />
            </button>
          </Tooltip>
          
          <Tooltip text="Nueva tarea (N)">
            <button 
              className="add-task-btn"
              onClick={() => setShowTaskForm(true)}
              aria-label="Crear nueva tarea"
            >
              <Plus size={24} />
            </button>
          </Tooltip>
        </div>
      </div>
      
      <StatsBar stats={state.stats} tasks={state.tasks} />
      
      <div className="tasks-container">
        {displayedTasks.length > 0 ? (
          <div className="tasks-list">
            {displayedTasks.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                priorityScore={taskService.calculatePriority(task)}
                onToggle={handleToggleTask}
                onEdit={handleEditTask}
                onDelete={handleDeleteTask}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Target size={40} />
            </div>
            <h3>No hay tareas</h3>
            <p>
              {state.filters.search || state.filters.status !== 'all' || state.filters.priority !== 'all'
                ? 'No se encontraron tareas con los filtros aplicados'
                : 'Crea tu primera tarea para empezar'}
            </p>
          </div>
        )}
      </div>
      
      {/* Notifications */}
      <div className="notifications-container">
        {state.notifications.map(notification => (
          <Notification
            key={notification.timestamp}
            notification={notification}
            onClose={(timestamp) => dispatch({ type: 'REMOVE_NOTIFICATION', payload: timestamp })}
          />
        ))}
      </div>
      
      {/* Modals */}
      {(showTaskForm || editingTask) && (
        <TaskForm
          editTask={editingTask}
          onAdd={handleAddTask}
          onUpdate={handleUpdateTask}
          onCancel={() => {
            setShowTaskForm(false);
            setEditingTask(null);
          }}
        />
      )}
      
      {state.showFilters && (
        <FiltersPanel
          filters={state.filters}
          onUpdate={(filters) => dispatch({ type: 'UPDATE_FILTERS', payload: filters })}
          onClose={() => dispatch({ type: 'TOGGLE_FILTERS' })}
        />
      )}
      
      {state.showSettings && (
        <SettingsPanel
          settings={state.settings}
          onUpdate={(settings) => {
            dispatch({ type: 'UPDATE_SETTINGS', payload: settings });
            notificationService.notify('Configuración guardada ✓', 'success');
          }}
          onClose={() => dispatch({ type: 'TOGGLE_SETTINGS' })}
        />
      )}
      
      {state.showHelp && (
        <HelpPanel
          onClose={() => dispatch({ type: 'TOGGLE_HELP' })}
          onStartTutorial={() => {
            dispatch({ type: 'TOGGLE_HELP' });
            dispatch({ type: 'START_TUTORIAL' });
          }}
        />
      )}
      
      {state.tutorial.active && (
        <Tutorial
          step={state.tutorial.step}
          onNext={() => dispatch({ type: 'NEXT_TUTORIAL_STEP' })}
          onEnd={() => dispatch({ type: 'END_TUTORIAL' })}
        />
      )}
    </div>
  );
}
