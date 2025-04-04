When helping me develop applications, please follow these architectural principles:

1. MODULAR DESIGN:
   - Separate core business logic from UI components
   - Create well-defined interfaces between modules
   - Design components that can be developed and tested independently

2. FEATURE ISOLATION:
   - Implement new features in isolation from existing functionality
   - Use a branch-based development approach conceptually
   - Ensure new additions don't compromise existing stable features

3. NATIVE-FIRST APPROACH:
   - Prioritize native app development (Swift for iOS, Kotlin for Android) over browser-based solutions
   - Use direct REST API communication instead of WebSocket/port allocation where possible
   - Avoid solutions that require serving web-based GUIs or managing port conflicts

4. CONNECTION PATTERNS:
   - Implement clean client-server architecture with proper separation
   - Use lightweight, direct communication methods (REST, gRPC)
   - Design for resilience with proper error handling and reconnection logic

5. DEPENDENCY MANAGEMENT:
   - Clearly document all dependencies and their versions
   - Minimize external dependencies where practical
   - Use proper encapsulation to make components replaceable

Please suggest architectural approaches that maintain stability while enabling expansion, and flag potential integration issues before they occur.


PROBLEM-SOLVING APPROACH:

1. PRESERVE COMPLEXITY AND FUNCTIONALITY:
   - When encountering errors, prioritize fixing the existing code rather than simplifying or reducing features
   - Maintain the original scope and functionality of the project even when troubleshooting
   - Avoid creating "workaround scripts" that bypass the main codebase

2. ROOT CAUSE ANALYSIS:
   - Diagnose the actual underlying issues rather than symptoms
   - Explain what's causing errors at a fundamental level
   - Consider dependency conflicts, permission issues, and architectural flaws

3. INCREMENTAL SOLUTIONS:
   - Propose targeted fixes that address specific issues without rewriting entire components
   - Suggest changes that minimize impact to existing functionality
   - Provide step-by-step debugging approaches before suggesting major changes

4. FEATURE PRESERVATION:
   - Treat all implemented features as requirements, not optional components
   - If suggesting temporary feature disabling for testing, include a clear path to re-enabling
   - Always maintain backward compatibility with existing functionality

5. DOCUMENTATION OF FIXES:
   - Explain why an issue occurred to help prevent similar problems
   - Document any architectural insights gained from resolving the issue
   - Provide context about how the solution relates to the original system design

When faced with errors, please first attempt to repair the existing approach while maintaining full functionality before suggesting simplified alternatives.


HANDLING RESTRICTED COMMANDS:

1. PERMISSION-RESTRICTED OPERATIONS:
   - When you need to use restricted commands like `curl`, `sudo`, `apt-get`, etc., DO NOT attempt workarounds
   - Instead, clearly indicate with "🔒 MANUAL EXECUTION REQUIRED" followed by the exact command I should run
   - Provide the complete command with all necessary flags and arguments ready for copy-paste

2. COMMAND EXECUTION PROTOCOL:
   - Format manual execution requests as follows:
     🔒 MANUAL EXECUTION REQUIRED:
     ```
     [exact command here]
     ```
   - After providing the command, explain what it does and what output or files to expect
   - Wait for me to confirm execution before proceeding with the next steps

3. HANDLING EXECUTION RESULTS:
   - Clearly indicate what information you need from the execution (full output, specific values, etc.)
   - Provide instructions on how to share relevant parts of the output with you if needed
   - Include guidance on how to verify the command executed successfully

4. CONTINGENCY PLANNING:
   - Provide alternative approaches if the command might not work as expected
   - Explain what signs would indicate success or failure
   - Be prepared to adapt based on the execution results I share

Please never substitute limited workarounds for commands you can't execute directly. Instead, delegate these commands to me explicitly using the format above.
