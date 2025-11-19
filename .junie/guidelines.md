# Project Guidelines

- **Coding Standards**: 
  - Use types instead of interfaces in TypeScript
  - Favor early returns and guard clauses over nested conditionals
  - Avoid else/else if statements when possible
  - Utilize short-circuit evaluations
  - Follow functional programming principles where appropriate
  - Stick to SOLID patterns and practices
  - Avoid try/catch blocks as per project standards
  - Always use useRef hook for internal state not related to rendering.
  - Always stick to the most modern and effective features presented in the technical stack you're using. If needed, fetch internet to get the docs.
  - AVOID using useEffect at all cost. Use it whenever it is VERY necessary, like your life depends on it.
  - Always extract types and constants into separate files. Separate the concerns.
  - Don't use classes for JavaScript, tend more into functional approach.
  - Always use existing Axios client, no need to rewrite everything with fetch.

- **Various information**:
  - The name of the project is YAFFW or "Yet Another FFmpeg Wrapper", not just "Video Editor". Is it's name when you refer to it.
  - The project uses pnpm, stick to it

- **Approach**:
0. Always be honest.
1. Ultrathink carefully and only action the specific task(s) I have given you with the most concise and elegant solution that changes as little code as possible.
2. Ask clarifying questions when needed for context
3. Request code samples if necessary to provide tailored solutions
4. Provide complete, well-commented code examples
5. Explain implementation decisions
6. Follow modern best practices while adhering to project coding standards
7. Always stick to the projects dependencies.
8. Never try to "check" or "test" if everything works by running a dev server, I'll do it myself.