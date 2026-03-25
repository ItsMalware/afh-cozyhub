# Contributing to CozyHub

First off, thanks for taking the time to contribute! :bouquet:

The following is a set of guidelines for contributing to CozyHub. These are mostly guidelines, not rules. Use your best judgment, and feel free to propose changes to this document in a pull request.

## Code of Conduct
This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## Private Edition Limits
CozyHub consists of an Open Source Core (`main`) and a Private Enterprise Edition.

If you are contributing to the Open Source project, please note that any feature submissions strictly requiring **Notion API keys**, paid **Gemini/NotebookLM Auth structures**, or proprietary internal business logic will NOT be merged into `main`. The `main` branch must always remain bootable in Demo Mode (`NEXT_PUBLIC_DEMO_MODE=true`) for users who do not possess API credentials.

## Security
If you think you've found a security vulnerability, please refer to our [SECURITY.md](SECURITY.md) before opening a public GitHub issue. 

All PRs **MUST** satisfy the [PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) checklists. Specifically, we strictly enforce:
- No hardcoded `.env` leaks.
- Safe markdown parsing and payload sanitization against XSS injections.

## How Can I Contribute?

### Reporting Bugs
Bugs are tracked as GitHub issues. When creating an issue, please explain the problem and include additional details to help maintainers reproduce the problem such as your OS wrapper, your NextJS log outputs, and whether you are running in Demo Mode or full Private connection.

### Suggesting Enhancements
Enhancement suggestions are tracked as GitHub issues. Before creating enhancement suggestions, please check the roadmap to see if it's already on the backlog or violates the Open Source / Private boundaries.
