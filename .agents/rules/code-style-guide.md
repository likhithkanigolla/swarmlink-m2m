---
trigger: always_on
---

## 1. General Rules

Before writing, modifying, or refactoring any code, inspect the existing codebase and understand its architecture, coding conventions, dependencies, and related components.

- Follow existing project architecture and established patterns.
- Prefer simple, readable, maintainable, and modular solutions.
- Follow SOLID principles where applicable, DRY (Don't Repeat Yourself), KISS (Keep It Simple), and separation of concerns.
- Avoid unnecessary complexity, duplication, premature optimization, and overengineering.
- Do not introduce unrelated changes when implementing a feature or fixing a bug.
- Do not silently change existing functionality or public interfaces.
- Never leave incomplete implementations, placeholder logic, unexplained TODOs, or commented-out code.
- Do not claim that a task is complete until the relevant verification steps have been performed.

## 2. Mandatory Testing

**Every code change must include appropriate tests.**

Whenever you add, modify, or fix code:

1. Identify the affected components, functions, APIs, and dependencies.
2. Write or update unit tests for the changed functionality.
3. Add integration tests when multiple components or services interact.
4. Add regression tests for every bug fix.
5. Test normal cases, edge cases, invalid inputs, and failure scenarios.
6. Test authorization and permission boundaries where relevant.
7. Mock external dependencies only when appropriate. Do not mock the functionality being tested.
8. Ensure tests are deterministic, isolated, and repeatable.
9. Run the relevant tests and fix failures introduced by your changes.
10. Never delete, weaken, skip, or modify an existing test merely to make the test suite pass.

Use the testing framework already established in the repository. If the project has no testing framework, recommend an appropriate one and follow the existing package ecosystem.

Do not claim tests pass unless you have actually executed them. If tests cannot be executed, explain why and identify the remaining verification steps.

## 3. SonarQube and Code Quality

All code must follow applicable SonarQube quality rules and the project's configured Quality Gate.

- Resolve new bugs, vulnerabilities, security hotspots, and code smells introduced by your changes.
- Avoid duplicated code and unnecessarily complex functions.
- Reduce cognitive complexity and cyclomatic complexity where practical.
- Use meaningful variable, function, class, and file names.
- Remove unused variables, imports, functions, and unreachable code.
- Avoid deeply nested conditionals and excessively long functions.
- Handle errors explicitly and consistently.
- Avoid broad exception handling that hides failures.
- Do not suppress linting, compiler, or SonarQube warnings without a documented technical justification.
- Do not reduce test assertions or quality thresholds to obtain a passing result.
- Follow the project's configured coverage requirements for new and changed code.

Run the repository's available linting, formatting, type-checking, testing, and SonarQube analysis commands where applicable. Report any unresolved issues honestly.

Do not assume that a successful build means the SonarQube Quality Gate has passed.

## 4. Security Best Practices

Treat security as a requirement, not an optional improvement.

- Validate all untrusted input at system boundaries.
- Enforce authentication and authorization on protected operations.
- Apply least-privilege principles.
- Prevent SQL injection by using parameterized queries or safe ORM methods.
- Prevent cross-site scripting through appropriate output handling and safe rendering.
- Protect against CSRF where applicable to the authentication architecture.
- Avoid command injection, path traversal, insecure deserialization, and unsafe dynamic execution.
- Never hardcode credentials, API keys, tokens, private keys, or production secrets.
- Use environment variables or an approved secret-management mechanism.
- Never expose passwords, tokens, sensitive user information, or internal stack traces in logs or API responses.
- Use secure cookie settings, appropriate CORS policies, and HTTPS in production.
- Apply rate limiting and abuse protection to sensitive or publicly accessible endpoints where appropriate.
- Use dependency versions that are compatible and supported, and check for known vulnerabilities using available tooling.
- Do not weaken existing security controls to make development easier.

## 5. Error Handling and Logging

- Handle expected failure scenarios explicitly.
- Return consistent and meaningful API error responses.
- Never silently swallow exceptions.
- Do not expose internal implementation details to clients.
- Use the project's established logging framework.
- Log sufficient diagnostic information without exposing secrets or sensitive data.
- Avoid excessive logging inside high-frequency operations.
- Ensure cleanup of resources such as database connections, file handles, and network connections.
- Use appropriate timeouts and failure handling for external service calls.

## 6. Architecture and Maintainability

- Keep business logic separate from UI components, routing, persistence, and infrastructure concerns.
- Reuse existing services, utilities, hooks, and abstractions when appropriate.
- Avoid introducing unnecessary dependencies.
- Keep interfaces small and responsibilities focused.
- Avoid circular dependencies and tightly coupled modules.
- Maintain clear boundaries between components and services.
- Use dependency injection or equivalent techniques where they improve testability and modularity.
- Preserve backward compatibility unless a breaking change is explicitly required.
- Update interfaces, schemas, database migrations, and API contracts consistently.
- Document architectural decisions when a change introduces a meaningful long-term trade-off.

Do not introduce a new architectural pattern merely for the sake of using it. Choose the simplest approach consistent with the project's requirements.

## 7. Frontend Standards

For React and TypeScript applications:

- Prefer TypeScript and explicit, accurate types.
- Avoid `any`; use proper types, generics, or `unknown` with appropriate narrowing.
- Keep components focused and reasonably small.
- Extract reusable logic into hooks or utility modules when justified.
- Avoid unnecessary re-renders and expensive computations.
- Follow React's rules of hooks.
- Use stable and meaningful keys when rendering lists.
- Handle loading, empty, error, and success states.
- Validate user input and provide accessible error messages.
- Use semantic HTML and accessible labels, keyboard navigation, and focus management.
- Avoid duplicating business logic across components.
- Keep API communication and data transformation consistent with existing conventions.
- Avoid exposing server-side secrets or privileged operations in client-side code.

## 8. Backend and API Standards

For backend services and APIs:

- Validate request parameters, payloads, and relevant response data.
- Keep routes or controllers thin and delegate business logic to appropriate modules.
- Apply authentication, authorization, and input validation consistently.
- Use database transactions when multiple operations must succeed or fail together.
- Handle concurrency and duplicate requests where relevant.
- Avoid N+1 queries and unnecessary database access.
- Define appropriate constraints and indexes for database operations.
- Use pagination and bounded queries for potentially large datasets.
- Set timeouts and handle external service failures.
- Maintain consistent API response structures and HTTP status codes.
- Add tests for authorization, validation, business rules, and failure scenarios.

## 9. Database and Migration Safety

- Never make destructive database changes without explicit requirements and an appropriate migration.
- Avoid manually changing production schemas outside the established migration process.
- Ensure migrations are version-controlled and reproducible.
- Consider data integrity, foreign keys, indexes, constraints, and transaction safety.
- Review migration compatibility with existing data.
- Provide rollback or recovery guidance when appropriate.
- Do not place credentials or sensitive production data in migrations, fixtures, or test files.

## 10. Dependencies and Configuration

- Reuse existing dependencies whenever possible.
- Add a new dependency only when its benefit justifies the maintenance and security cost.
- Update lockfiles whenever dependencies change.
- Do not upgrade unrelated dependencies without a clear reason.
- Keep environment-specific configuration outside application source code.
- Document newly introduced environment variables and configuration requirements.
- Ensure development, testing, and production configurations remain consistent where required.

## 11. Documentation

Update relevant documentation whenever a change affects behavior, setup, configuration, APIs, or architecture.

- Keep README files and setup instructions accurate.
- Document non-obvious business rules and complex logic.
- Add API documentation for new or modified endpoints.
- Document new environment variables and dependencies.
- Update architecture decision records when the change represents a meaningful architectural decision.
- Prefer comments explaining why something is necessary rather than repeating what the code already says.

## 12. Required Workflow for Every Change

Follow this workflow for every feature, bug fix, refactor, or configuration change.

### Step 1: Inspect
Understand the relevant files, dependencies, existing implementation, tests, and project conventions.

### Step 2: Plan
Identify the smallest safe implementation, affected components, risks, and required tests.

### Step 3: Implement
Make focused changes while following all applicable standards.

### Step 4: Test
Write or update tests and run the relevant test suite.

### Step 5: Validate
Run available formatting, linting, type-checking, build, security, and SonarQube checks as applicable.

### Step 6: Review
Inspect the final diff for accidental changes, duplication, security issues, missing tests, and incomplete implementation.

### Step 7: Report
Summarize the changes, tests executed, their actual results, quality checks, and any unresolved issues.

Do not skip required steps merely because a change appears small. Scale the verification effort to the change's risk and impact.

## 13. Definition of Done

A change is complete only when:

- The requested functionality is implemented.
- Existing functionality is preserved unless intentionally changed.
- Relevant automated tests are added or updated.
- Applicable tests pass, or failures and limitations are explicitly reported.
- Linting, formatting, and type-checking pass where configured.
- No known new security vulnerabilities or avoidable code-quality issues are introduced.
- SonarQube findings and Quality Gate status are reported when analysis is available.
- Relevant documentation and configuration are updated.
- The final changes have been reviewed for unintended side effects.

If any criterion cannot be satisfied, state the limitation clearly rather than claiming full completion.

## 14. Instructions to the AI Coding Agent

These rules are mandatory throughout the development session.

Before making changes, read this file and any more specific project instructions. Apply the rules to every relevant code change, including changes generated by other AI agents.

Do not sacrifice correctness, security, maintainability, or test quality for implementation speed.

When requirements are ambiguous, inspect existing patterns and make conservative decisions. Ask for clarification when an ambiguity could materially affect architecture, security, data integrity, or expected behavior.

Never fabricate test results, build results, coverage percentages, or SonarQube