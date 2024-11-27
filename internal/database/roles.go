package database

import "time"

type Task struct {
	TaskId              int
	GroupId             int
	DeadLine            time.Time
	TimeForExecution    time.Duration
	Priority            float64
	PercentOfCompleting int
	Status              string // e.g., "Pending", "In Progress", "Completed"
	Description         string
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

type Group struct {
	GroupId     int
	Tasks       []*Task
	Status      string // e.g., "Active", "Archived"
	Description string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type Day struct {
	Date             time.Time
	TimeForTasks     time.Duration
	Tasks            []*Task
	PriorityOfTheDay float64
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type User struct {
	UserId      int64
	Nickname    string
	Groups      []*Group
	Tasks       []*Task
	Preferences map[string]string // e.g., "Theme": "Dark", "Notifications": "Enabled"
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
