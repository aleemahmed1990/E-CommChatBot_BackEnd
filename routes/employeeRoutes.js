const express = require("express");
const router = express.Router();
const Employee = require("../models/Employee");

// ✅ GET: List all employees with filters
router.get("/", async (req, res) => {
  try {
    const {
      role,
      available,
      category,
      search,
      page = 1,
      limit = 10,
    } = req.query;

    console.log("=== EMPLOYEE LIST QUERY ===");
    console.log("Filters:", { role, available, category, search });

    let query = {};

    if (role) {
      query.roles = role;
    }

    if (available === "true") {
      query["availability.status"] = "available";
    }

    if (category) {
      query.employeeCategory = category;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { employeeId: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await Employee.countDocuments(query);
    const employees = await Employee.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    console.log("=== EMPLOYEE LIST RESULT ===");
    console.log("Total found:", total);
    console.log("Returned:", employees.length);

    res.json({
      success: true,
      employees,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching employees",
      error: error.message,
    });
  }
});

// ✅ GET: Get available employees by role (for driver assignment)
router.get("/available/:role", async (req, res) => {
  try {
    const { role } = req.params;

    console.log("=== GET AVAILABLE EMPLOYEES ===");
    console.log("Role:", role);

    const employees = await Employee.find({
      roles: role,
      $expr: { $lt: ["$currentAssignments", "$maxAssignments"] },
      "availability.status": "available",
      isActivated: true,
      isBlocked: false,
    }).select(
      "employeeId name phone email currentAssignments maxAssignments performanceMetrics.rating"
    );

    console.log("Found available employees:", employees.length);

    res.json({
      success: true,
      employees,
      count: employees.length,
    });
  } catch (error) {
    console.error("Error fetching available employees:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching available employees",
      error: error.message,
    });
  }
});

// ✅ GET: Get specific employee by ID
router.get("/:employeeId", async (req, res) => {
  try {
    const { employeeId } = req.params;

    const employee = await Employee.findOne({ employeeId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    res.json({
      success: true,
      employee,
    });
  } catch (error) {
    console.error("Error fetching employee:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching employee",
      error: error.message,
    });
  }
});

// ✅ POST: Create new employee
router.post("/", async (req, res) => {
  try {
    const employeeData = req.body;

    console.log("=== CREATE EMPLOYEE ===");
    console.log("Data:", employeeData);

    const employee = new Employee(employeeData);
    await employee.save();

    console.log("Employee created:", employee.employeeId);

    res.status(201).json({
      success: true,
      message: "Employee created successfully",
      employee,
    });
  } catch (error) {
    console.error("Error creating employee:", error);
    res.status(500).json({
      success: false,
      message: "Error creating employee",
      error: error.message,
    });
  }
});

// ✅ PUT: Update employee availability
router.put("/:employeeId/availability", async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { status, leaveStartDate, leaveEndDate, leaveReason } = req.body;

    console.log("=== UPDATE EMPLOYEE AVAILABILITY ===");
    console.log("Employee ID:", employeeId);
    console.log("New status:", status);

    const employee = await Employee.findOne({ employeeId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    employee.availability.status = status;
    employee.availability.lastStatusUpdate = new Date();

    if (status === "on-leave") {
      employee.availability.leaveStartDate = leaveStartDate;
      employee.availability.leaveEndDate = leaveEndDate;
      employee.availability.leaveReason = leaveReason;
    }

    await employee.save();

    res.json({
      success: true,
      message: "Availability updated successfully",
      employee,
    });
  } catch (error) {
    console.error("Error updating availability:", error);
    res.status(500).json({
      success: false,
      message: "Error updating availability",
      error: error.message,
    });
  }
});

// ✅ POST: Assign order to employee
router.post("/:employeeId/assign-order", async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { orderId, customerId, customerName, estimatedCompletionTime } =
      req.body;

    console.log("=== ASSIGN ORDER TO EMPLOYEE ===");
    console.log("Employee:", employeeId);
    console.log("Order:", orderId);

    const employee = await Employee.findOne({ employeeId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    if (employee.currentAssignments >= employee.maxAssignments) {
      return res.status(400).json({
        success: false,
        message: "Employee has reached maximum assignments",
      });
    }

    // Add order to assignedOrders
    employee.assignedOrders.push({
      orderId,
      customerId,
      customerName,
      assignedAt: new Date(),
      estimatedCompletionTime,
      status: "assigned",
    });

    // Increment current assignments
    employee.currentAssignments += 1;

    await employee.save();

    console.log("Order assigned successfully");

    res.json({
      success: true,
      message: "Order assigned successfully",
      employee,
    });
  } catch (error) {
    console.error("Error assigning order:", error);
    res.status(500).json({
      success: false,
      message: "Error assigning order",
      error: error.message,
    });
  }
});

// ✅ PUT: Update order status for employee
router.put("/:employeeId/order-status/:orderId", async (req, res) => {
  try {
    const { employeeId, orderId } = req.params;
    const { status } = req.body;

    console.log("=== UPDATE EMPLOYEE ORDER STATUS ===");
    console.log("Employee:", employeeId);
    console.log("Order:", orderId);
    console.log("Status:", status);

    const employee = await Employee.findOne({ employeeId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const orderIndex = employee.assignedOrders.findIndex(
      (o) => o.orderId === orderId
    );

    if (orderIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Order not found in employee assignments",
      });
    }

    employee.assignedOrders[orderIndex].status = status;

    // If order is completed or failed, decrement assignments
    if (status === "completed" || status === "failed") {
      employee.currentAssignments = Math.max(
        0,
        employee.currentAssignments - 1
      );

      // Update performance metrics if completed
      if (status === "completed") {
        employee.performanceMetrics.successfulDeliveries += 1;
        employee.performanceMetrics.totalDeliveries += 1;
      } else if (status === "failed") {
        employee.performanceMetrics.failedDeliveries += 1;
        employee.performanceMetrics.totalDeliveries += 1;
      }
    }

    await employee.save();

    res.json({
      success: true,
      message: "Order status updated",
      employee,
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating order status",
      error: error.message,
    });
  }
});

// ✅ GET: Get current assignments for employee
router.get("/:employeeId/assignments", async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { status } = req.query;

    const employee = await Employee.findOne({ employeeId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    let assignments = employee.assignedOrders;

    if (status) {
      assignments = assignments.filter((a) => a.status === status);
    }

    res.json({
      success: true,
      assignments,
      total: assignments.length,
      currentAssignments: employee.currentAssignments,
      maxAssignments: employee.maxAssignments,
    });
  } catch (error) {
    console.error("Error fetching assignments:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching assignments",
      error: error.message,
    });
  }
});

// ✅ PUT: Update employee location (for drivers on delivery)
router.put("/:employeeId/location", async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { latitude, longitude, address } = req.body;

    const employee = await Employee.findOne({ employeeId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    employee.currentLocation = {
      latitude,
      longitude,
      address,
      updatedAt: new Date(),
    };

    await employee.save();

    res.json({
      success: true,
      message: "Location updated",
      employee,
    });
  } catch (error) {
    console.error("Error updating location:", error);
    res.status(500).json({
      success: false,
      message: "Error updating location",
      error: error.message,
    });
  }
});

// ✅ POST: Log employee activity
router.post("/:employeeId/activity", async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { action, orderId, details } = req.body;

    const employee = await Employee.findOne({ employeeId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    employee.activityLog.push({
      action,
      timestamp: new Date(),
      orderId,
      details,
    });

    // Keep only last 100 activities
    if (employee.activityLog.length > 100) {
      employee.activityLog = employee.activityLog.slice(-100);
    }

    await employee.save();

    res.json({
      success: true,
      message: "Activity logged",
    });
  } catch (error) {
    console.error("Error logging activity:", error);
    res.status(500).json({
      success: false,
      message: "Error logging activity",
      error: error.message,
    });
  }
});

// ✅ GET: Get employee performance metrics
router.get("/:employeeId/performance", async (req, res) => {
  try {
    const { employeeId } = req.params;

    const employee = await Employee.findOne({ employeeId }).select(
      "employeeId name performanceMetrics"
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    res.json({
      success: true,
      performanceMetrics: employee.performanceMetrics,
    });
  } catch (error) {
    console.error("Error fetching performance metrics:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching performance metrics",
      error: error.message,
    });
  }
});

module.exports = router;
