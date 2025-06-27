import React, { useState, useEffect } from 'react';
import { trace } from '@opentelemetry/api';
import './App.css';

const tracer = trace.getTracer('todo-frontend', '1.0.0');

function App() {
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedBackend, setSelectedBackend] = useState('go');

  // Load todos on component mount and when selectedBackend changes
  useEffect(() => {
    loadTodos();
  }, [selectedBackend]);

  const loadTodos = async () => {
    const span = tracer.startSpan('load_todos');
    span.setAttributes({
      'user.action': 'load_todos',
      'component': 'TodoList',
      'backend': selectedBackend
    });

    try {
      setIsLoading(true);
      setError('');
      
      const endpoint = selectedBackend === 'java' ? '/java/todos' : '/go/todos';
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      // Both services return arrays directly
      const todosArray = Array.isArray(data) ? data : [];
      setTodos(todosArray);
      span.addEvent('Todos loaded successfully');
      span.setAttributes({
        'todos.count': todosArray.length
      });
    } catch (err) {
      console.error('Error loading todos:', err);
      setError(`Failed to load todos from ${selectedBackend} service`);
      span.recordException(err);
      span.setStatus({ code: 2, message: err.message });
    } finally {
      setIsLoading(false);
      span.end();
    }
  };

  const createTodo = async (e) => {
    e.preventDefault();
    
    const span = tracer.startSpan('create_todo');
    span.setAttributes({
      'user.action': 'create_todo',
      'todo.name': newTodo,
      'todo.name.length': newTodo.length,
      'backend': selectedBackend
    });

    try {
      setIsLoading(true);
      setError('');
      
      const endpoint = selectedBackend === 'java' ? '/java/todos' : '/go/todos';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newTodo }),
      });

      if (response.ok) {
        const createdTodo = await response.json();
        // Add to current view since we're using the same backend
        setTodos(prev => [...prev, createdTodo]);
        setNewTodo('');
        span.addEvent('Todo created successfully');
        span.setAttributes({
          'todo.id': createdTodo.id,
          'operation.result': 'success'
        });
      } else {
        throw new Error(`Failed to create todo in ${selectedBackend} service`);
      }
    } catch (err) {
      console.error('Error creating todo:', err);
      setError(err.message);
      span.recordException(err);
      span.setStatus({ code: 2, message: err.message });
    } finally {
      setIsLoading(false);
      span.end();
    }
  };

  const deleteTodo = async (id) => {
    const span = tracer.startSpan('delete_todo');
    span.setAttributes({
      'user.action': 'delete_todo',
      'todo.id': id,
      'backend': selectedBackend
    });

    try {
      setIsLoading(true);
      const endpoint = selectedBackend === 'java' ? `/java/todos/${id}` : `/go/todos/${id}`;
      const response = await fetch(endpoint, {
        method: 'DELETE',
      });

      if (response.ok) {
        setTodos(prev => prev.filter(todo => todo.id !== id));
        span.addEvent('Todo deleted successfully');
        span.setAttributes({
          'operation.result': 'success'
        });
      } else {
        throw new Error(`Failed to delete todo from ${selectedBackend} service`);
      }
    } catch (err) {
      console.error('Error deleting todo:', err);
      setError(err.message);
      span.recordException(err);
      span.setStatus({ code: 2, message: err.message });
    } finally {
      setIsLoading(false);
      span.end();
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>
          <img src="/opentelemetry-logo.svg" alt="OpenTelemetry" className="otel-logo" />
        </h1>
        <p>A simple todo app demonstrating distributed tracing</p>
      </header>

      <main className="App-main">
        {error && <div className="error">{error}</div>}
        
        <div className="backend-selectors">
          <div className="selector-group">
            <label htmlFor="backend-select">Backend Service:</label>
            <select 
              id="backend-select"
              value={selectedBackend} 
              onChange={(e) => setSelectedBackend(e.target.value)}
              disabled={isLoading}
            >
              <option value="go">Go Service</option>
              <option value="java">Java Service</option>
            </select>
          </div>
        </div>
        
        <form onSubmit={createTodo} className="todo-form">
          <input
            type="text"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            placeholder="Enter a new todo..."
            disabled={isLoading}
            required
          />
          <button type="submit" disabled={isLoading || !newTodo.trim()}>
            {isLoading ? 'Adding...' : 'Add Todo'}
          </button>
        </form>

        <div className="todos-container">
          <h2>Todos from {selectedBackend.charAt(0).toUpperCase() + selectedBackend.slice(1)} Service ({todos.length})</h2>
          {isLoading && <p>Loading...</p>}
          
          {todos.length === 0 && !isLoading ? (
            <p className="no-todos">No todos yet. Add one above!</p>
          ) : (
            <ul className="todos-list">
              {todos.map(todo => (
                <li key={todo.id} className="todo-item">
                  <span className="todo-name">{todo.name}</span>
                  <button 
                    onClick={() => deleteTodo(todo.id)}
                    className="delete-btn"
                    disabled={isLoading}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

      </main>
      
      <footer className="app-footer">
        <p>Crafted with ❤️ by <img src="/dash0-logo.svg" alt="Dash0" className="dash0-logo" /></p>
      </footer>
    </div>
  );
}

export default App;