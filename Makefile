.PHONY: sync check lint test identity changelog app-test app-lint

# Overridable so a platform without this name can supply its own:
#   make test PYTHON=py
PYTHON ?= python3
# The application commands run under bun. The command execution gate denies
# every bun invocation, so the Makefile is the route that an agent uses.
BUN ?= bun

PROSE_FILES = AGENTS.md README.md CHANGELOG.md DRIFT.md \
	docs/gate-threat-model.md docs/review-automation.md \
	docs/orientation.md docs/project-orientation.md \
	docs/template-drift.md \
	plan/HANDOFF.md.example SECURITY.md.example CONTRIBUTING.md.example \
	.github/PULL_REQUEST_TEMPLATE.md .github/ISSUE_TEMPLATE.md

sync:
	$(PYTHON) scripts/sync.py

check:
	$(PYTHON) scripts/sync.py --check

changelog:
	$(PYTHON) scripts/check_changelog.py

lint:
	$(PYTHON) scripts/lint_style.py
	$(PYTHON) scripts/check_us_spelling.py $(PROSE_FILES)
	$(PYTHON) scripts/check_english_only.py $(PROSE_FILES)
	$(PYTHON) scripts/check_hedging.py $(PROSE_FILES)
	$(PYTHON) scripts/check_conflict_markers.py
	$(BUN) run lint

app-lint:
	$(BUN) run lint

app-test:
	$(BUN) run test:app

test:
	$(PYTHON) scripts/run_tests.py
	$(BUN) run test:app

identity:
	$(PYTHON) scripts/check_git_identity.py --advise
