## Organization Structure

### Standard Project Structure
Each project should follow this standard structure:
```
project-name/
├── README.md              # Project overview, setup instructions
├── LICENSE                # License information
├── .gitignore             # Git ignore file
├── requirements.txt       # Python dependencies
├── Dockerfile             # Container configuration
├── docker-compose.yml     # Docker Compose config (if applicable)
├── .vscode/               # VS Code configuration
│   ├── settings.json      # Editor settings
│   └── launch.json        # Debug configurations
├── src/                   # Source code
│   └── [project modules]
├── tests/                 # Test suite
│   └── [test files]
├── docs/                  # Documentation
│   └── [documentation files]
└── scripts/               # Utility scripts
    └── [script files]
```

### Naming Conventions
- **Repositories**: Use kebab-case for repository names (e.g., `mcp-server`, `live-event-controller`)
- **Files**: Use kebab-case for filenames (e.g., `camera-controller.py`, `audio-processor.js`)
- **Classes**: Use PascalCase (e.g., `CameraController`, `AudioProcessor`)
- **Functions/Variables**: Use snake_case (e.g., `process_audio`, `camera_status`)
- **Constants**: Use UPPER_SNAKE_CASE (e.g., `MAX_CONNECTIONS`, `DEFAULT_TIMEOUT`)

