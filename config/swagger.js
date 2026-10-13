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
      Account: {
        type: "object",
        description: "An owned financial account. openingAmount is the declared opening value, not a live or ledger-adjusted balance.",
        properties: {
          id: { type: "integer", example: 15 },
          type: { type: "string", enum: ["bank", "cash", "wallet", "credit_card"] },
          subtype: { type: "string", enum: ["savings", "current", "salary", "cash", "stored_value", "credit_card"] },
          displayName: { type: "string", example: "Primary salary account" },
          institutionName: { type: "string", nullable: true, example: "Example Bank" },
          maskedLast4: { type: "string", nullable: true, pattern: "^[0-9]{4}$", example: "1234" },
          currencyCode: { type: "string", enum: ["INR"], example: "INR" },
          openingAmount: { type: "string", pattern: "^-?[0-9]+\\.[0-9]{2}$", example: "25000.00" },
          creditLimit: { type: "string", nullable: true, pattern: "^[0-9]+\\.[0-9]{2}$", example: "100000.00" },
          isDefault: { type: "boolean" },
          status: { type: "string", enum: ["active", "archived"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      AccountCreate: {
        type: "object",
        required: ["type", "subtype", "displayName", "clientCreationKey"],
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: ["bank", "cash", "wallet", "credit_card"] },
          subtype: { type: "string", enum: ["savings", "current", "salary", "cash", "stored_value", "credit_card"] },
          displayName: { type: "string", maxLength: 100 },
          institutionName: { type: "string", nullable: true, maxLength: 100 },
          maskedLast4: { type: "string", nullable: true, pattern: "^[0-9]{4}$" },
          currencyCode: { type: "string", enum: ["INR"], default: "INR" },
          openingAmount: { type: "string", pattern: "^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,2})?$", default: "0.00", example: "25000.00" },
          creditLimit: { type: "string", nullable: true, pattern: "^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,2})?$", example: "100000.00" },
          isDefault: { type: "boolean", default: false },
          clientCreationKey: { type: "string", pattern: "^[A-Za-z0-9._:-]{8,100}$" },
        },
      },
      AccountUpdate: {
        type: "object",
        required: ["displayName"],
        additionalProperties: false,
        properties: {
          displayName: { type: "string", minLength: 1, maxLength: 100 },
          institutionName: { type: "string", nullable: true, minLength: 1, maxLength: 100 },
          maskedLast4: { type: "string", nullable: true, pattern: "^[0-9]{4}$" },
        },
      },
      AccountResponse: {
        type: "object",
        required: ["success", "message", "data"],
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string" },
          data: {
            type: "object",
            required: ["account"],
            properties: { account: { $ref: "#/components/schemas/Account" } },
          },
        },
      },
      AccountListResponse: {
        type: "object",
        required: ["success", "message", "data"],
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Accounts fetched" },
          data: {
            type: "object",
            required: ["accounts", "total", "page", "limit"],
            properties: {
              accounts: { type: "array", items: { $ref: "#/components/schemas/Account" } },
              total: { type: "integer", minimum: 0 },
              page: { type: "integer", minimum: 1 },
              limit: { type: "integer", minimum: 1, maximum: 100 },
            },
          },
        },
      },
      Error: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string" },
          errors: { type: "array", nullable: true, items: { type: "object" } },
        },
      },
      Transfer: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          sourceAccountId: { type: "integer", example: 5 },
          destinationAccountId: { type: "integer", example: 6 },
          sourceAccountName: { type: "string", example: "Primary Bank" },
          destinationAccountName: { type: "string", example: "Cash Wallet" },
          amount: { type: "string", example: "500.00" },
          currencyCode: { type: "string", example: "INR" },
          transferDate: { type: "string", format: "date", example: "2026-10-11" },
          note: { type: "string", nullable: true, example: "ATM withdrawal" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      TransferCreate: {
        type: "object",
        required: ["sourceAccountId", "destinationAccountId", "amount", "transferDate", "clientTransferKey"],
        properties: {
          sourceAccountId: { type: "integer", example: 5 },
          destinationAccountId: { type: "integer", example: 6 },
          amount: { type: "string", pattern: "^(0|[1-9]\\d*)(\\.\\d{1,2})?$", example: "500.00" },
          transferDate: { type: "string", format: "date", example: "2026-10-11" },
          note: { type: "string", nullable: true, example: "ATM withdrawal" },
          clientTransferKey: { type: "string", example: "tr-client-001" },
        },
      },
      AccountBalance: {
        type: "object",
        properties: {
          accountId: { type: "integer", example: 5 },
          displayName: { type: "string", example: "Primary Bank" },
          type: { type: "string", example: "bank" },
          subtype: { type: "string", example: "savings" },
          currencyCode: { type: "string", example: "INR" },
          openingAmount: { type: "string", example: "1000.00" },
          currentBalance: { type: "string", example: "1450.00" },
          totalIncome: { type: "string", example: "500.00" },
          totalExpense: { type: "string", example: "50.00" },
          transfersIn: { type: "string", example: "100.00" },
          transfersOut: { type: "string", example: "100.00" },
          totalAdjustments: { type: "string", example: "0.00" },
          creditLimit: { type: "string", nullable: true },
          availableCredit: { type: "string", nullable: true },
        },
      },
      AccountAdjustment: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          accountId: { type: "integer", example: 5 },
          amount: { type: "string", example: "-25.00" },
          reason: { type: "string", example: "Bank charge reconciliation" },
          adjustmentDate: { type: "string", format: "date", example: "2026-10-11" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      AccountAdjustmentCreate: {
        type: "object",
        required: ["amount", "reason", "adjustmentDate", "clientAdjustmentKey"],
        properties: {
          amount: { type: "string", pattern: "^-?(0|[1-9]\\d*)(\\.\\d{1,2})?$", example: "-25.00" },
          reason: { type: "string", minLength: 3, maxLength: 255, example: "Bank fee correction" },
          adjustmentDate: { type: "string", format: "date", example: "2026-10-11" },
          clientAdjustmentKey: { type: "string", example: "adj-client-001" },
        },
      },
      TransferResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Transfer completed" },
          data: {
            type: "object",
            properties: {
              transfer: { $ref: "#/components/schemas/Transfer" },
            },
          },
        },
      },
      TransferListResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Transfers fetched" },
          data: {
            type: "object",
            properties: {
              transfers: { type: "array", items: { $ref: "#/components/schemas/Transfer" } },
              total: { type: "integer" },
              page: { type: "integer" },
              limit: { type: "integer" },
            },
          },
        },
      },
      AccountBalanceResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Account balance fetched" },
          data: {
            type: "object",
            properties: {
              balance: { $ref: "#/components/schemas/AccountBalance" },
            },
          },
        },
      },
      AccountActivityResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Account activity fetched" },
          data: {
            type: "object",
            properties: {
              activities: { type: "array", items: { type: "object" } },
              total: { type: "integer" },
              page: { type: "integer" },
              limit: { type: "integer" },
            },
          },
        },
      },
      AccountAdjustmentResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Adjustment recorded" },
          data: {
            type: "object",
            properties: {
              adjustment: { $ref: "#/components/schemas/AccountAdjustment" },
            },
          },
        },
      },
      AccountAdjustmentListResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Adjustments fetched" },
          data: {
            type: "object",
            properties: {
              adjustments: { type: "array", items: { $ref: "#/components/schemas/AccountAdjustment" } },
              total: { type: "integer" },
              page: { type: "integer" },
              limit: { type: "integer" },
            },
          },
        },
      },
      DetectedTransaction: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          userId: { type: "integer", example: 42 },
          accountId: { type: "integer", nullable: true, example: 5 },
          accountName: { type: "string", nullable: true, example: "Primary HDFC" },
          categoryId: { type: "integer", nullable: true, example: 2 },
          categoryName: { type: "string", nullable: true, example: "Food" },
          classification: { type: "string", example: "expense" },
          amount: { type: "string", example: "450.00" },
          transactionDate: { type: "string", format: "date", example: "2026-10-11" },
          merchantRaw: { type: "string", example: "SWIGGY BANGALORE" },
          merchantClean: { type: "string", example: "Swiggy" },
          bank: { type: "string", example: "HDFC" },
          sender: { type: "string", example: "HDFCBK" },
          referenceNumber: { type: "string", nullable: true, example: "987654321000" },
          maskedAccountHint: { type: "string", nullable: true, example: "1234" },
          smsHash: { type: "string", example: "a1b2c3d4..." },
          confidence: { type: "number", example: 0.95 },
          confidenceReason: { type: "string", example: "Merchant recognized: Swiggy; Account matched: **1234" },
          suggestedAccountId: { type: "integer", nullable: true, example: 5 },
          suggestedAccountName: { type: "string", nullable: true, example: "Primary HDFC" },
          suggestedCategoryId: { type: "integer", nullable: true, example: 2 },
          suggestedCategoryName: { type: "string", nullable: true, example: "Food" },
          isAccountAmbiguous: { type: "boolean", example: false },
          status: { type: "string", enum: ["detected", "suggested", "confirmed", "rejected"], example: "suggested" },
          rejectionReason: { type: "string", nullable: true },
          confirmedTransactionId: { type: "integer", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      DetectedTransactionResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Detected transaction fetched" },
          data: {
            type: "object",
            properties: {
              transaction: { $ref: "#/components/schemas/DetectedTransaction" },
            },
          },
        },
      },
      DetectedTransactionListResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Detected transactions fetched" },
          data: {
            type: "object",
            properties: {
              detectedTransactions: { type: "array", items: { $ref: "#/components/schemas/DetectedTransaction" } },
              total: { type: "integer" },
              page: { type: "integer" },
              limit: { type: "integer" },
            },
          },
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
    "/api/budgets/progress": {
      get: {
        tags: ["Budgets"],
        summary: "Get real-time budget progress, overall limits, category breakdown and savings target",
        parameters: [
          { name: "month", in: "query", schema: { type: "integer" }, required: false },
          { name: "year", in: "query", schema: { type: "integer" }, required: false },
          { name: "savingsTarget", in: "query", schema: { type: "number" }, required: false },
        ],
        responses: {
          200: {
            description: "Real-time budget progress metrics and forecasts",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Budget progress fetched" },
                    data: { type: "object" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/budgets/alerts": {
      get: {
        tags: ["Budgets"],
        summary: "Get active budget warnings, approaching limits, exceeded alerts, and actionable insights",
        parameters: [
          { name: "month", in: "query", schema: { type: "integer" }, required: false },
          { name: "year", in: "query", schema: { type: "integer" }, required: false },
        ],
        responses: {
          200: {
            description: "Active budget alerts and insights",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Budget alerts fetched" },
                    data: { type: "object" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/budgets/suggestions": {
      get: {
        tags: ["Budgets"],
        summary: "Get deterministic smart budget suggestions based on 3-month historical analysis",
        parameters: [
          { name: "month", in: "query", schema: { type: "integer" }, required: false },
          { name: "year", in: "query", schema: { type: "integer" }, required: false },
          { name: "savingsTarget", in: "query", schema: { type: "number" }, required: false },
        ],
        responses: {
          200: {
            description: "Suggested budget amounts and spending trends",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Budget suggestions fetched" },
                    data: { type: "object" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/budgets/history": {
      get: {
        tags: ["Budgets"],
        summary: "Get historical spending vs budget comparison over past months",
        parameters: [
          { name: "months", in: "query", schema: { type: "integer", default: 6 }, required: false },
        ],
        responses: {
          200: {
            description: "Historical budget comparison periods",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Budget history fetched" },
                    data: { type: "object" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/budgets/savings-target": {
      get: {
        tags: ["Budgets"],
        summary: "Get monthly savings target tracking and net savings progress",
        parameters: [
          { name: "month", in: "query", schema: { type: "integer" }, required: false },
          { name: "year", in: "query", schema: { type: "integer" }, required: false },
          { name: "targetAmount", in: "query", schema: { type: "number" }, required: false },
        ],
        responses: {
          200: {
            description: "Savings target progress status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Savings target progress fetched" },
                    data: { type: "object" },
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
    "/api/accounts": {
      post: {
        tags: ["Accounts"],
        summary: "Create an account idempotently",
        description: "Money inputs must be decimal strings. Credit-card openingAmount represents outstanding debt. Bank-linked UPI apps are not stored-value wallets.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AccountCreate" } } },
        },
        responses: {
          201: { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/AccountResponse" } } } },
          200: { description: "Matching idempotent replay", content: { "application/json": { schema: { $ref: "#/components/schemas/AccountResponse" } } } },
          400: { description: "Validation or account-state error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          401: { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          409: { description: "Idempotency-key conflict", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          503: { description: "Account operation is busy", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      get: {
        tags: ["Accounts"],
        summary: "List owned accounts",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "type", in: "query", schema: { type: "string", enum: ["bank", "cash", "wallet", "credit_card"] } },
          { name: "status", in: "query", schema: { type: "string", enum: ["active", "archived"], default: "active" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: { description: "Owned account page", content: { "application/json": { schema: { $ref: "#/components/schemas/AccountListResponse" } } } },
          400: { description: "Invalid filters or pagination", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          401: { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/accounts/{id}": {
      get: {
        tags: ["Accounts"],
        summary: "Get one owned account",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1, maximum: 4294967295 } }],
        responses: {
          200: { description: "Owned account", content: { "application/json": { schema: { $ref: "#/components/schemas/AccountResponse" } } } },
          400: { description: "Invalid account id", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          401: { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          404: { description: "Not found or not owned", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      put: {
        tags: ["Accounts"],
        summary: "Update mutable account metadata",
        description: "Type, subtype, currency, opening amount, credit limit, status, default selection and idempotency key are immutable through this endpoint.",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1, maximum: 4294967295 } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AccountUpdate" } } } },
        responses: {
          200: { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/AccountResponse" } } } },
          400: { description: "Invalid id or metadata", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          401: { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          404: { description: "Not found or not owned", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          409: { description: "Archived account", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          503: { description: "Account operation is busy", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/accounts/{id}/default": {
      put: {
        tags: ["Accounts"],
        summary: "Make an active asset account the default",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1, maximum: 4294967295 } }],
        responses: {
          200: { description: "Default selected", content: { "application/json": { schema: { $ref: "#/components/schemas/AccountResponse" } } } },
          400: { description: "Invalid id or credit-card account", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          401: { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          404: { description: "Not found or not owned", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          409: { description: "Archived account", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          503: { description: "Account operation is busy", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/accounts/{id}/archive": {
      put: {
        tags: ["Accounts"],
        summary: "Archive an account without deleting history",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1, maximum: 4294967295 } }],
        responses: {
          200: { description: "Archived; a replacement default is selected when available", content: { "application/json": { schema: { $ref: "#/components/schemas/AccountResponse" } } } },
          400: { description: "Invalid account id", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          401: { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          404: { description: "Not found or not owned", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          503: { description: "Account operation is busy", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/transfers": {
      post: {
        tags: ["Transfers"],
        summary: "Execute an atomic inter-account transfer",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/TransferCreate" } } },
        },
        responses: {
          201: { description: "Transfer completed", content: { "application/json": { schema: { $ref: "#/components/schemas/TransferResponse" } } } },
          400: { description: "Validation failure or invalid accounts", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          401: { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          409: { description: "Idempotency key reused with different payload", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          503: { description: "Account operation busy", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      get: {
        tags: ["Transfers"],
        summary: "List transfers with pagination and optional account filter",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "accountId", in: "query", schema: { type: "integer" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          200: { description: "Transfers fetched", content: { "application/json": { schema: { $ref: "#/components/schemas/TransferListResponse" } } } },
          401: { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/transfers/{id}": {
      get: {
        tags: ["Transfers"],
        summary: "Get transfer by ID",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: { description: "Transfer fetched", content: { "application/json": { schema: { $ref: "#/components/schemas/TransferResponse" } } } },
          401: { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          404: { description: "Transfer not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/accounts/{id}/balance": {
      get: {
        tags: ["Account Ledger"],
        summary: "Get exact ledger-computed balance for an account",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: { description: "Account balance fetched", content: { "application/json": { schema: { $ref: "#/components/schemas/AccountBalanceResponse" } } } },
          401: { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          404: { description: "Account not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/accounts/{id}/activity": {
      get: {
        tags: ["Account Ledger"],
        summary: "Get unified chronological activity feed for an account",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          200: { description: "Account activity fetched", content: { "application/json": { schema: { $ref: "#/components/schemas/AccountActivityResponse" } } } },
          401: { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          404: { description: "Account not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/accounts/{id}/adjustments": {
      post: {
        tags: ["Account Ledger"],
        summary: "Record an auditable balance adjustment",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AccountAdjustmentCreate" } } },
        },
        responses: {
          201: { description: "Adjustment recorded", content: { "application/json": { schema: { $ref: "#/components/schemas/AccountAdjustmentResponse" } } } },
          400: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          401: { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          404: { description: "Account not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          409: { description: "Idempotency conflict", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      get: {
        tags: ["Account Ledger"],
        summary: "List balance adjustments for an account",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          200: { description: "Adjustments fetched", content: { "application/json": { schema: { $ref: "#/components/schemas/AccountAdjustmentListResponse" } } } },
          401: { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          404: { description: "Account not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/smart-transactions/detect": {
      post: {
        tags: ["Smart Transactions"],
        summary: "Ingest and parse SMS messages into suggested transactions",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  messages: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        sender: { type: "string", example: "HDFCBK" },
                        message: { type: "string", example: "Rs 450.00 debited from A/C **1234 on 11-Oct-26 at Swiggy." },
                        date: { type: "string", example: "2026-10-11T12:00:00Z" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Detection complete" },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
        },
      },
    },
    "/api/smart-transactions": {
      get: {
        tags: ["Smart Transactions"],
        summary: "List detected transactions with suggestions and review status",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["suggested", "detected", "confirmed", "rejected", "all"] } },
          { name: "classification", in: "query", schema: { type: "string" } },
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          200: { description: "Transactions fetched", content: { "application/json": { schema: { $ref: "#/components/schemas/DetectedTransactionListResponse" } } } },
          401: { description: "Unauthorized" },
        },
      },
    },
    "/api/smart-transactions/{id}": {
      get: {
        tags: ["Smart Transactions"],
        summary: "Get detected transaction details",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: { description: "Found", content: { "application/json": { schema: { $ref: "#/components/schemas/DetectedTransactionResponse" } } } },
          404: { description: "Not found" },
        },
      },
      put: {
        tags: ["Smart Transactions"],
        summary: "Apply manual corrections to detected transaction",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  merchantClean: { type: "string", example: "Swiggy" },
                  classification: { type: "string", example: "expense" },
                  categoryId: { type: "integer", example: 2 },
                  accountId: { type: "integer", example: 5 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Updated" },
          400: { description: "Invalid input" },
          404: { description: "Not found" },
        },
      },
    },
    "/api/smart-transactions/{id}/confirm": {
      post: {
        tags: ["Smart Transactions"],
        summary: "Confirm detected transaction into ledger",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  merchantClean: { type: "string" },
                  classification: { type: "string" },
                  categoryId: { type: "integer" },
                  accountId: { type: "integer" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Confirmed and posted to ledger" },
          400: { description: "Invalid selection" },
          404: { description: "Not found" },
          409: { description: "Already confirmed or rejected" },
        },
      },
    },
    "/api/smart-transactions/{id}/reject": {
      post: {
        tags: ["Smart Transactions"],
        summary: "Reject detected transaction",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reason: { type: "string", example: "Duplicate or irrelevant notification" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Rejected" },
          404: { description: "Not found" },
          409: { description: "Already confirmed" },
        },
      },
    },
    "/api/smart-transactions/batch/confirm": {
      post: {
        tags: ["Smart Transactions"],
        summary: "Batch confirm detected transactions",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  items: { type: "array", items: { type: "object" } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Batch processed" },
        },
      },
    },
    "/api/smart-transactions/batch/reject": {
      post: {
        tags: ["Smart Transactions"],
        summary: "Batch reject detected transactions",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ids: { type: "array", items: { type: "integer" } },
                  reason: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Batch rejected" },
        },
      },
    },
    "/dashboard": {
      get: {
        tags: ["Dashboard Analytics"],
        summary: "Get comprehensive Dashboard 2.0 analytics and financial overview",
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: "query", name: "period", schema: { type: "string", enum: ["current_month", "previous_month", "custom"] } },
          { in: "query", name: "month", schema: { type: "string", pattern: "^\\d{4}-\\d{2}$", example: "2026-10" } },
          { in: "query", name: "startDate", schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } },
          { in: "query", name: "endDate", schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } },
        ],
        responses: {
          200: {
            description: "Dashboard 2.0 summary and analytics",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Dashboard summary fetched" },
                    data: { type: "object" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/dashboard/overview": {
      get: {
        tags: ["Dashboard Analytics"],
        summary: "Get Dashboard 2.0 financial overview",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Dashboard 2.0 overview",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { type: "object" },
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
      "/api/analytics/capabilities": {
        get: {
          tags: ["Analytics"],
          summary: "Get Phase 5A analytics capabilities, supported questions, and privacy guarantee",
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: "Capabilities fetched successfully",
            },
          },
        },
      },
      "/api/analytics/query": {
        post: {
          tags: ["Analytics"],
          summary: "Execute deterministic financial analytics query or classified question",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    question: { type: "string", example: "How much did I spend this month?" },
                    intent: { type: "string", example: "total_spending" },
                    period: { type: "string", example: "current_month" },
                    startDate: { type: "string", example: "2026-10-01" },
                    endDate: { type: "string", example: "2026-10-31" },
                    month: { type: "string", example: "2026-10" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Analytics query result with provenance and privacy notice",
            },
          },
        },
      },
      "/api/analytics/insights": {
        get: {
          tags: ["Analytics"],
          summary: "Get deterministic financial insights for the requested period",
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: "period",
              in: "query",
              schema: { type: "string", enum: ["current_month", "previous_month", "last_30_days", "custom"] },
            },
            {
              name: "month",
              in: "query",
              schema: { type: "string", example: "2026-10" },
            },
          ],
          responses: {
            200: {
              description: "Financial insights fetched successfully",
            },
          },
        },
      },
      "/api/goals": {
        get: {
          tags: ["Goals"],
          summary: "List all savings goals for authenticated user",
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: "status",
              in: "query",
              schema: { type: "string", enum: ["active", "completed", "archived", "all"] },
            },
          ],
          responses: {
            200: { description: "Savings goals retrieved successfully" },
          },
        },
        post: {
          tags: ["Goals"],
          summary: "Create a new savings goal",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "targetAmount"],
                  properties: {
                    name: { type: "string", example: "Emergency Fund" },
                    description: { type: "string", example: "6 months living expenses" },
                    targetAmount: { type: "number", example: 100000 },
                    currency: { type: "string", example: "INR" },
                    targetDate: { type: "string", format: "date", example: "2027-12-31" },
                    startingAmount: { type: "number", example: 10000 },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Savings goal created successfully" },
          },
        },
      },
      "/api/goals/summary": {
        get: {
          tags: ["Goals"],
          summary: "Get aggregated savings goals summary metrics",
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: "Savings goals summary retrieved successfully" },
          },
        },
      },
      "/api/goals/forecast": {
        get: {
          tags: ["Goals"],
          summary: "Get deterministic cash-flow forecast",
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: "horizon",
              in: "query",
              schema: { type: "string", enum: ["next_30_days", "next_3_months", "next_6_months", "next_12_months"] },
            },
          ],
          responses: {
            200: { description: "Cash-flow forecast generated successfully" },
          },
        },
      },
      "/api/goals/simulate": {
        post: {
          tags: ["Goals"],
          summary: "Run interactive what-if financial scenario simulation",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["scenarioType"],
                  properties: {
                    scenarioType: { type: "string", enum: ["savings_adjustment", "expense_reduction", "goal_timeline", "income_change"] },
                    monthlySavingsAdjustment: { type: "number" },
                    expenseReductionPercentage: { type: "number" },
                    expenseReductionAmount: { type: "number" },
                    goalId: { type: "integer" },
                    targetMonths: { type: "integer" },
                    incomeChangeAmount: { type: "number" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "What-if simulation executed successfully" },
          },
        },
      },
      "/api/goals/{id}": {
        get: {
          tags: ["Goals"],
          summary: "Get goal details and progress intelligence by ID",
          security: [{ BearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            200: { description: "Savings goal retrieved successfully" },
            404: { description: "Goal not found" },
          },
        },
        put: {
          tags: ["Goals"],
          summary: "Update goal details",
          security: [{ BearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            200: { description: "Savings goal updated successfully" },
          },
        },
        delete: {
          tags: ["Goals"],
          summary: "Delete goal and its contributions",
          security: [{ BearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            200: { description: "Savings goal deleted successfully" },
          },
        },
      },
      "/api/goals/{id}/contributions": {
        get: {
          tags: ["Goals"],
          summary: "List contributions for a goal",
          security: [{ BearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            200: { description: "Goal contributions retrieved successfully" },
          },
        },
        post: {
          tags: ["Goals"],
          summary: "Record savings progress contribution for a goal",
          security: [{ BearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["amount"],
                  properties: {
                    amount: { type: "number", example: 5000 },
                    contributionDate: { type: "string", format: "date", example: "2026-10-15" },
                    note: { type: "string", example: "Monthly salary allocation" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Goal contribution recorded successfully" },
          },
        },
      },
    },
  },
};

export default swaggerDocument;
