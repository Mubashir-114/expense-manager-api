const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "Personal Finance Manager API",
    version: "1.0.0",
    description: "Production-ready API documentation for the Personal Finance Manager backend.",
  },
  servers: [
    {
      url: "http://localhost:5000",
      description: "Development server",
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Enter your JWT token in the format: Bearer <token>",
      },
    },
    schemas: {
      User: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          name: { type: "string", example: "John Doe" },
          email: { type: "string", example: "john@example.com" },
          created_at: { type: "string", format: "date-time", example: "2026-08-01T10:00:00Z" },
        },
      },
      Transaction: {
        type: "object",
        required: ["categoryId", "type", "title", "amount", "transactionDate"],
        properties: {
          id: { type: "integer", example: 10 },
          categoryId: { type: "integer", example: 2 },
          category: { type: "string", example: "Food" },
          type: { type: "string", enum: ["income", "expense"], example: "expense" },
          title: { type: "string", example: "Weekly Grocery Run" },
          amount: { type: "number", format: "float", example: 150.50 },
          transactionDate: { type: "string", format: "date", example: "2026-08-03" },
          note: { type: "string", nullable: true, example: "Whole Foods shop" },
          created_at: { type: "string", format: "date-time", example: "2026-08-03T14:32:00Z" },
        },
      },
      Budget: {
        type: "object",
        required: ["categoryId", "amount", "month", "year"],
        properties: {
          id: { type: "integer", example: 5 },
          categoryId: { type: "integer", example: 2 },
          category: { type: "string", example: "Food" },
          amount: { type: "number", format: "float", example: 500.00 },
          month: { type: "integer", minimum: 1, maximum: 12, example: 8 },
          year: { type: "integer", minimum: 2000, maximum: 2100, example: 2026 },
          created_at: { type: "string", format: "date-time", example: "2026-08-01T12:00:00Z" },
        },
      },
    },
  },
  security: [
    {
      BearerAuth: [],
    },
  ],
  paths: {
    "/api/auth/register": {
      post: {
        tags: ["Authentication"],
        summary: "Register a new user",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "email", "password"],
                properties: {
                  name: { type: "string", example: "John Doe" },
                  email: { type: "string", example: "john@example.com" },
                  password: { type: "string", example: "password123" },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "Registration successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Registration successful" },
                    data: {
                      type: "object",
                      properties: {
                        token: { type: "string", example: "eyJhbGciOi..." },
                        user: { $ref: "#/components/schemas/User" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Login an existing user",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", example: "john@example.com" },
                  password: { type: "string", example: "password123" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Login successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Login successful" },
                    data: {
                      type: "object",
                      properties: {
                        token: { type: "string", example: "eyJhbGciOi..." },
                        user: { $ref: "#/components/schemas/User" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Authentication"],
        summary: "Get authenticated user profile",
        responses: {
          200: {
            description: "Profile details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Profile fetched" },
                    data: {
                      type: "object",
                      properties: {
                        user: { $ref: "#/components/schemas/User" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/transactions": {
      post: {
        tags: ["Transactions"],
        summary: "Create a transaction",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["categoryId", "type", "title", "amount", "transactionDate"],
                properties: {
                  categoryId: { type: "integer", example: 2 },
                  type: { type: "string", enum: ["income", "expense"], example: "expense" },
                  title: { type: "string", example: "Weekly Grocery Run" },
                  amount: { type: "number", example: 150.50 },
                  transactionDate: { type: "string", example: "2026-08-03" },
                  note: { type: "string", example: "Whole Foods shop" },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "Transaction added successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Transaction added" },
                    data: {
                      type: "object",
                      properties: {
                        transactionId: { type: "integer", example: 10 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      get: {
        tags: ["Transactions"],
        summary: "List all transactions with optional filters",
        parameters: [
          { name: "type", in: "query", schema: { type: "string", enum: ["income", "expense"] }, required: false },
          { name: "categoryId", in: "query", schema: { type: "integer" }, required: false },
          { name: "search", in: "query", schema: { type: "string" }, required: false },
          { name: "from", in: "query", schema: { type: "string", format: "date" }, required: false },
          { name: "to", in: "query", schema: { type: "string", format: "date" }, required: false },
          { name: "page", in: "query", schema: { type: "integer", default: 1 }, required: false },
          { name: "limit", in: "query", schema: { type: "integer", default: 10 }, required: false },
        ],
        responses: {
          200: {
            description: "List of transactions and pagination stats",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Transactions fetched" },
                    data: {
                      type: "object",
                      properties: {
                        transactions: { type: "array", items: { $ref: "#/components/schemas/Transaction" } },
                        total: { type: "integer", example: 25 },
                        page: { type: "integer", example: 1 },
                        limit: { type: "integer", example: 10 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/transactions/{id}": {
      get: {
        tags: ["Transactions"],
        summary: "Get a transaction by ID",
        parameters: [{ name: "id", in: "path", schema: { type: "integer" }, required: true }],
        responses: {
          200: {
            description: "Transaction details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Transaction fetched" },
                    data: {
                      type: "object",
                      properties: {
                        transaction: { $ref: "#/components/schemas/Transaction" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      put: {
        tags: ["Transactions"],
        summary: "Update an existing transaction",
        parameters: [{ name: "id", in: "path", schema: { type: "integer" }, required: true }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  categoryId: { type: "integer", example: 2 },
                  type: { type: "string", example: "expense" },
                  title: { type: "string", example: "Updated grocery description" },
                  amount: { type: "number", example: 160.00 },
                  transactionDate: { type: "string", example: "2026-08-03" },
                  note: { type: "string", example: "Updated note info" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Transaction updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Transaction updated" },
                    data: {
                      type: "object",
                      properties: {
                        transaction: { $ref: "#/components/schemas/Transaction" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Transactions"],
        summary: "Delete a transaction",
        parameters: [{ name: "id", in: "path", schema: { type: "integer" }, required: true }],
        responses: {
          200: {
            description: "Transaction deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Transaction deleted" },
                    data: { type: "object", nullable: true, example: null },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/dashboard": {
      get: {
        tags: ["Dashboard"],
        summary: "Get overall financial balance summary",
        responses: {
          200: {
            description: "Summary numbers",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Dashboard summary fetched" },
                    data: {
                      type: "object",
                      properties: {
                        totalIncome: { type: "number", example: 5000.00 },
                        totalExpense: { type: "number", example: 1200.00 },
                        balance: { type: "number", example: 3800.00 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/budgets": {
      post: {
        tags: ["Budgets"],
        summary: "Set a monthly budget for a category",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["categoryId", "amount", "month", "year"],
                properties: {
                  categoryId: { type: "integer", example: 2 },
                  amount: { type: "number", example: 500.00 },
                  month: { type: "integer", example: 8 },
                  year: { type: "integer", example: 2026 },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "Budget set successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Budget created" },
                    data: {
                      type: "object",
                      properties: {
                        budget: { $ref: "#/components/schemas/Budget" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      get: {
        tags: ["Budgets"],
        summary: "List all active budgets",
        parameters: [
          { name: "month", in: "query", schema: { type: "integer" }, required: false },
          { name: "year", in: "query", schema: { type: "integer" }, required: false },
          { name: "categoryId", in: "query", schema: { type: "integer" }, required: false },
        ],
        responses: {
          200: {
            description: "List of budgets",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Budgets fetched" },
                    data: {
                      type: "object",
                      properties: {
                        budgets: { type: "array", items: { $ref: "#/components/schemas/Budget" } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/budgets/status": {
      get: {
        tags: ["Budgets"],
        summary: "Check category budget usage limits and warning status",
        parameters: [
          { name: "month", in: "query", schema: { type: "integer" }, required: false },
          { name: "year", in: "query", schema: { type: "integer" }, required: false },
        ],
        responses: {
          200: {
            description: "Calculated spent vs limits for each category budget",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Budget status fetched" },
                    data: {
                      type: "object",
                      properties: {
                        month: { type: "integer", example: 8 },
                        year: { type: "integer", example: 2026 },
                        budgets: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              budgetId: { type: "integer", example: 5 },
                              categoryId: { type: "integer", example: 2 },
                              category: { type: "string", example: "Food" },
                              budget: { type: "number", example: 500.00 },
                              spent: { type: "number", example: 350.00 },
                              remaining: { type: "number", example: 150.00 },
                              percentageUsed: { type: "number", example: 70.00 },
                              status: { type: "string", enum: ["safe", "over_budget"], example: "safe" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/reports/summary": {
      get: {
        tags: ["Reports"],
        summary: "Get high-level reports summary",
        parameters: [
          { name: "month", in: "query", schema: { type: "integer" }, required: false },
          { name: "year", in: "query", schema: { type: "integer" }, required: false },
          { name: "from", in: "query", schema: { type: "string", format: "date" }, required: false },
          { name: "to", in: "query", schema: { type: "string", format: "date" }, required: false },
          { name: "categoryId", in: "query", schema: { type: "integer" }, required: false },
          { name: "type", in: "query", schema: { type: "string", enum: ["income", "expense"] }, required: false },
        ],
        responses: {
          200: {
            description: "Aggregated reports numbers",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Report summary fetched" },
                    data: {
                      type: "object",
                      properties: {
                        totalIncome: { type: "number", example: 5000.00 },
                        totalExpense: { type: "number", example: 1200.00 },
                        netBalance: { type: "number", example: 3800.00 },
                        savingsRate: { type: "number", example: 76.00 },
                        totalTransactions: { type: "integer", example: 6 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/reports/category": {
      get: {
        tags: ["Reports"],
        summary: "Get category-wise budgets vs actual spent reports",
        parameters: [
          { name: "month", in: "query", schema: { type: "integer" }, required: false },
          { name: "year", in: "query", schema: { type: "integer" }, required: false },
          { name: "from", in: "query", schema: { type: "string", format: "date" }, required: false },
          { name: "to", in: "query", schema: { type: "string", format: "date" }, required: false },
          { name: "categoryId", in: "query", schema: { type: "integer" }, required: false },
        ],
        responses: {
          200: {
            description: "Category comparison logs",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Category report fetched" },
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          categoryId: { type: "integer", example: 2 },
                          category: { type: "string", example: "Food" },
                          budget: { type: "number", example: 500.00 },
                          spent: { type: "number", example: 350.00 },
                          remaining: { type: "number", example: 150.00 },
                          percentage: { type: "number", example: 70.00 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/reports/export": {
      get: {
        tags: ["Reports"],
        summary: "Export transaction data to CSV or JSON",
        parameters: [
          { name: "format", in: "query", schema: { type: "string", enum: ["csv", "json"], default: "csv" }, required: false },
          { name: "month", in: "query", schema: { type: "integer" }, required: false },
          { name: "year", in: "query", schema: { type: "integer" }, required: false },
          { name: "from", in: "query", schema: { type: "string", format: "date" }, required: false },
          { name: "to", in: "query", schema: { type: "string", format: "date" }, required: false },
          { name: "categoryId", in: "query", schema: { type: "integer" }, required: false },
          { name: "type", in: "query", schema: { type: "string", enum: ["income", "expense"] }, required: false },
        ],
        responses: {
          200: {
            description: "Export response",
            content: {
              "text/csv": { schema: { type: "string", example: "Transaction ID,Date,Type...\n" } },
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Export data fetched" },
                    data: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/health": {
      get: {
        tags: ["Health Monitoring"],
        summary: "System health check endpoint",
        security: [],
        responses: {
          200: {
            description: "Health status info",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "System is healthy" },
                    data: {
                      type: "object",
                      properties: {
                        database: { type: "string", example: "healthy" },
                        api: { type: "string", example: "healthy" },
                        environment: { type: "string", example: "development" },
                        uptime: { type: "number", example: 45.32 },
                        timestamp: { type: "string", example: "2026-08-01T10:45:00.000Z" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

export default swaggerDocument;
