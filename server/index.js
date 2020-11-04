const express = require("express");
const app = express();
const cors = require("cors");
const pool = require("./db");
const jwt = require("jsonwebtoken");
const { response } = require("express");

app.use(cors());
app.use(express.json());

function parseDate(raw_date) {
    function parseMonth(month) {
        switch (month) {
            case 'Jan':
                return '01';
            case 'Feb':
                return '02';
            case 'Mar':
                return '03';
            case 'Apr':
                return '04';
            case 'May':
                return '05';
            case 'Jun':
                return '06';
            case 'Jul':
                return '07';
            case 'Aug':
                return '08';
            case 'Sep':
                return '09';
            case 'Oct':
                return '10';
            case 'Nov':
                return '11';
            case 'Dec':
                return '12';
        }
    }

    date_string = new Date(raw_date).toDateString();
    date_tokens = date_string.split(" ");
    return `${date_tokens[3]}-${parseMonth(date_tokens[1])}-${date_tokens[2]}`
}


//routes

//register and login
app.use("/auth", require("./routes/jwtAuth"));

//user homepage
app.use("/home", require("./routes/homepage"));

//user profiles
app.use("/profile", require("./routes/profile"));

//admin APIs
//user profiles
app.use("/admin", require("./routes/admin"));

//submit enquiry
app.post("/submitenquiry", async (req, res) => {
    try {
        const { subject, message, date } = req.body
        const jwtToken = req.header("token")
        const user_email = jwt.verify(jwtToken, process.env.jwtSecret).user.email;
        const newEnquiry = await pool.query(
            "INSERT INTO enquiries (user_email, enq_type, submission, enq_message) VALUES($1, $2, $3, $4)",
            [user_email, subject, date, message]
        )
        res.json(newEnquiry.rows[0])
    } catch (err) {
        console.error(err.message)
    }
})

//get enquiries
app.get("/contact", async (req, res) => {
    try {
        const enq_type = req.query.enq_type
        var query = ''
        if (enq_type === 'All') {
            query = "SELECT * FROM enquiries"
        } else {
            query = `SELECT * FROM enquiries WHERE enq_type = '${enq_type}'`
        }
        const enquiries = await pool.query(query)
        res.json(enquiries.rows)
    } catch (err) {
        console.error(err.message)
    }
})

// get total num of jobs for each month in a year
app.get("/pcsline", async (req, res) => {
    try {
        const year = req.query.year
        const numJobsPerMonth = await pool.query(
            `SELECT employment_type, substring(duration, 1, 7) startYearMonth, COUNT(*)
                FROM transactions_details
                WHERE duration LIKE '${year}-%'
                GROUP BY (employment_type, startYearMonth)`
        )
        res.json(numJobsPerMonth.rows)
    } catch (err) {
        console.error(err.message)
    }
})

// get total num of jobs for fulltimer and parttimer in a month
app.get("/pcspie", async (req, res) => {
    try {
        const startYearMonth = req.query.duration
        const numJobs = await pool.query(
            `SELECT employment_type, COUNT(*)
                FROM transactions_details 
                WHERE duration LIKE '${startYearMonth}-%'
                AND t_status >= 3
                GROUP BY employment_type`
        )
        if (numJobs.rows.length === 0) {
            res.json([{ employment_type: 'fulltime', count: '0' }, { employment_type: 'parttime', count: '0' }])
        } else if (numJobs.rows.length === 1) {
            if (numJobs.rows[0].employment_type === 'fulltime') {
                res.json(numJobs.rows.concat([{ employment_type: 'parttime', count: '0' }]))
            } else if (numJobs.rows[0].employment_type === 'parttime') {
                res.json([{ employment_type: 'parttime', count: '0' }].concat(numJobs.rows))
            }
        } else {
            res.json(numJobs.rows)
        }
    } catch (err) {
        console.error(err.message)
    }
})

// get all enquiries to be answered by PCSadmin
app.get("/pcsenquiries", async (req, res) => {
    try {
        const filter = req.query.filter
        let query;
        if (filter === 'Pending') {
            query = "SELECT user_email, enq_type, submission, enq_message, answer \
                        FROM enquiries \
                        WHERE enquiries.answer IS NULL \
                        AND enquiries.admin_email IS NULL"
        } else if (filter === 'Replied') {
            query = "SELECT user_email, enq_type, submission, enq_message, answer \
                        FROM enquiries \
                        WHERE enquiries.answer IS NOT NULL \
                        AND enquiries.admin_email IS NOT NULL"
        } else {
            query = "SELECT user_email, enq_type, submission, enq_message, answer \
                        FROM enquiries"
        }

        const enquiries = await pool.query(query)
        res.json(enquiries.rows)
    } catch (err) {
        console.error(err.message)
    }
})

// submit answer to enquiry
app.put("/pcsanswer", async (req, res) => {
    try {
        const { user_email, enq_message, answer } = req.body
        const jwtToken = req.header("token")
        const admin_email = jwt.verify(jwtToken, process.env.jwtSecret).user.email;
        const response = await pool.query(`UPDATE enquiries 
                                            SET answer = '${answer}', 
                                                admin_email = '${admin_email}' 
                                            WHERE user_email = '${user_email}' 
                                            AND enq_message = '${enq_message}'`)
        res.json(response.rows[0])
    } catch (err) {
        console.error(err.message)
    }
})

//get all caretaker searches
app.get("/caretakers", async (req, res) => {
    try {
        const searches = await pool.query("SELECT DISTINCT full_name, user_address, \
                                            avg_rating, Caretakers.caretaker_email, offers_services.employment_type, \
                                            type_pref, service_avail_from, service_avail_to, daily_price \
                                            FROM Offers_services \
                                            LEFT JOIN Users \
                                            ON Offers_services.caretaker_email = Users.email \
                                            LEFT JOIN Caretakers \
                                            ON Offers_Services.caretaker_email = Caretakers.caretaker_email \
                                            ");
        res.json(searches.rows);
    } catch (error) {
        console.log(error.message)
    }
});

//get all caretaker searches
app.get("/caretakersadmin", async (req, res) => {
    try {
        const searches = await pool.query("SELECT c.caretaker_email, u.full_name, c.employment_type, c.avg_rating, td.cost, \
                                        td.duration_from, td.duration_to \
                                        FROM (Transactions_Details AS td JOIN Caretakers AS c \
                                            ON td.caretaker_email=c.caretaker_email) JOIN Users AS u \
                                            ON c.caretaker_email=u.email WHERE td.t_status>=3");
        res.json(searches.rows);
    } catch (error) {
        console.log(error.message)
    }
});

//get all pets owned by petowner
app.get("/pets", async (req, res) => {
    try {
        const jwtToken = req.header("token")
        const user_email = jwt.verify(jwtToken, process.env.jwtSecret).user.email;
        // console.log(user_email)
        const searches = await pool.query(`SELECT DISTINCT owner_email, pet_name, \
                                            gender, special_req, pet_type \
                                            FROM Owns_Pets \
                                            WHERE owner_email = '${user_email}'; \ 
                                            ` );
        res.json(searches.rows);
    } catch (error) {
        console.log(error.message)
    }
});

//delete selected pet
app.delete("/deletepet/:id", async (req, res) => {
    try {
        const jwtToken = req.header("token");
        const user_email = jwt.verify(jwtToken, process.env.jwtSecret).user.email;
        const { id } = req.params;
        const deleteItem = await pool.query(
            "DELETE FROM Owns_Pets \
            WHERE owner_email = $1 \
            AND pet_name = $2 \
            AND \
            (SELECT 1 FROM Transactions_Details \
            WHERE owner_email = $1 \
            AND pet_name = $2 \
            AND (t_status = 1 \
            OR t_status = 3)) IS NULL \
            ",
            [user_email, id]
        );

        res.json("Deleted item!");
    } catch (err) {
        console.log(err.message);
    }
});

//edit selected pet
app.put("/editpet", async (req, res) => {
    try {
        const { old_pet_name, new_pet_name, special_req, pet_type, gender } = req.body;
        const jwtToken = req.header("token")
        const user_email = jwt.verify(jwtToken, process.env.jwtSecret).user.email;
        console.log(user_email);

        const editPet = await pool.query(
            "UPDATE Owns_Pets SET (pet_name, special_req, pet_type, gender) = ($3, $4, $5, $6) \
            WHERE owner_email = $1 and pet_name = $2 \
            AND \
            (SELECT 1 FROM Transactions_Details \
            WHERE owner_email = $1 \
            AND pet_name = $2 \
            AND (t_status = 1 \
            OR t_status = 3)) IS NULL \
            RETURNING *" ,
            [user_email, old_pet_name, new_pet_name, special_req, pet_type, gender]);

        res.json(editPet.rows);
    } catch (err) {
        console.log(err.message);
    }
});

//edit selected user details
app.put("/edituser", async (req, res) => {
    try {
        const { full_name, user_address, profile_pic_address } = req.body;
        const jwtToken = req.header("token")
        const user_email = jwt.verify(jwtToken, process.env.jwtSecret).user.email;
        // console.log(user_email);

        const editedUser = await pool.query(
            "UPDATE Users SET (full_name, user_address, profile_pic_address) = ($1, $2, $3) \
            WHERE email = $4 RETURNING *" ,
            [full_name, user_address, profile_pic_address, user_email]);

        res.json(editedUser.rows);
    } catch (err) {
        console.log(err.message);
    }
});

//get all bids from petowner for caretaker
app.get("/bids", async (req, res) => {
    try {
        const jwtToken = req.header("token")
        const caretaker_email = jwt.verify(jwtToken, process.env.jwtSecret).user.email;
        // console.log(caretaker_email)
        const searches = await pool.query(`SELECT users.full_name, users.user_address, Petowner_bids.owner_email, Petowner_bids.selected_pet, \
                                            gender, special_req, service_request_period, offer_price, transfer_mode, Petowner_bids.pet_type \
                                            FROM Petowner_bids LEFT JOIN Owns_pets  \
                                            ON (Petowner_bids.selected_pet = Owns_pets.pet_name AND Owns_pets.owner_email = Petowner_bids.owner_email) \
                                            LEFT JOIN Users ON users.email = Petowner_bids.owner_email
                                            WHERE Petowner_bids.caretaker_email = '${caretaker_email}';\ 
                                            ` );
        res.json(searches.rows);
    } catch (error) {
        console.log(error.message)
    }
});

//get all transactions for caretaker or petowner
app.get("/transactions", async (req, res) => {
    try {
        const jwtToken = req.header("token");
        const user_email = jwt.verify(jwtToken, process.env.jwtSecret).user.email;
        const acc_type = req.header("acc_type");
        // console.log(user_email)
        let searches;
        if (acc_type === "petowner") {
            var sql = `SELECT users.full_name, users.user_address, Transactions_Details.owner_email, Transactions_Details.pet_name, \
            gender, special_req, owns_pets.pet_type, duration_to, duration_from, cost, mode_of_transfer, t_status, caretaker_email \
            FROM Transactions_Details LEFT JOIN Owns_pets  \
            ON (Transactions_Details.pet_name = Owns_pets.pet_name AND Owns_pets.owner_email = Transactions_Details.owner_email) \
            LEFT JOIN Users ON users.email = Transactions_Details.caretaker_email
            WHERE Transactions_Details.owner_email = '${user_email}'\ 
            `
            if (req.query.t_status != undefined) {
                if (req.query.t_status == "4") {
                    sql += " AND (t_status = 4 OR t_status = 5)";
                }
                if (req.query.t_status != "" && req.query.t_status != "4") {
                    sql += " AND t_status = ";
                    sql += ("'" + req.query.t_status + "'");
                }
            }

            searches = await pool.query(sql);
        } else if (acc_type === "caretaker") {
            searches = await pool.query(`SELECT users.full_name, users.user_address, Transactions_Details.owner_email, Transactions_Details.pet_name, \
                                            gender, Transactions_Details.pet_type, special_req, duration_to, duration_from, cost, mode_of_transfer, t_status, caretaker_email \
                                            FROM Transactions_Details LEFT JOIN Owns_pets  \
                                            ON (Transactions_Details.pet_name = Owns_pets.pet_name AND Owns_pets.owner_email = Transactions_Details.owner_email) \
                                            LEFT JOIN Users ON users.email = Transactions_Details.owner_email
                                            WHERE Transactions_Details.caretaker_email = '${user_email}';\ 
                                            ` );
        }

        res.json(searches.rows);
    } catch (error) {
        console.log(error.message)
    }
});

//get all transactions for caretaker or petowner
app.get("/salary", async (req, res) => {
    try {
        let caretaker_email
        if (req.query.caretaker_email.indexOf("@") === -1) {
            let jwtToken = req.query.caretaker_email
            caretaker_email = jwt.verify(jwtToken, process.env.jwtSecret).user.email;
        } else {
            caretaker_email = req.query.caretaker_email
        }
        const searches = await pool.query("SELECT caretaker_email, employment_type, cost, duration_from, duration_to \
                                             FROM transactions_details WHERE caretaker_email=$1 AND t_status>=3\
                                             ORDER BY duration_from", [caretaker_email]);
        res.json(searches.rows);
    } catch (error) {
        console.log(error.message)
    }
}); 4

//get all transactions for caretaker or petowner
app.get("/filtersalary", async (req, res) => {
    try {
        let caretaker_email;
        let month = req.query.month;
        if (req.query.caretaker_email.indexOf("@") === -1) {
            let jwtToken = req.query.caretaker_email;
            caretaker_email = jwt.verify(jwtToken, process.env.jwtSecret).user.email;;
        } else {
            caretaker_email = req.query.caretaker_email;
        }

        const searches = await pool.query("SELECT caretaker_email, employment_type, cost, duration_from, duration_to \
                                             FROM transactions_details WHERE caretaker_email=$1 AND t_status>=3\
                                             AND (EXTRACT(MONTH FROM duration_to)=$2 OR EXTRACT(MONTH FROM duration_from)=$3)\
                                         ORDER BY duration_from", [caretaker_email, month, month]);
        res.json(searches.rows);
    } catch (error) {
        console.log(error.message)
    }
});



//get all filtered searches
app.get("/caretakersq", async (req, res) => {
    try {
        var sql = "SELECT DISTINCT full_name, user_address, \
        avg_rating, Caretakers.caretaker_email, Caretakers.employment_type, \
        type_pref, service_avail, daily_price \
        FROM Offers_services \
        LEFT JOIN Users \
        ON Offers_services.caretaker_email = Users.email \
        LEFT JOIN Caretakers \
        ON Offers_Services.caretaker_email = Caretakers.caretaker_email \
        WHERE 1 = 1";

        if (req.query.employment_type != undefined && req.query.employment_type != "") {
            sql += " AND Caretakers.employment_type = ";
            sql += ("'" + req.query.employment_type + "'");
        }
        if (req.query.avg_rating != undefined && req.query.avg_rating != "") {
            sql += " AND avg_rating >= ";
            sql += (req.query.avg_rating);
            sql += " AND avg_rating < ";
            sql += (req.query.avg_rating + 1);
        }
        if (req.query.type_pref != undefined && req.query.type_pref != "") {
            sql += " AND type_pref = ";
            sql += ("'" + req.query.type_pref + "'");
        }
        if (req.query.start_date != undefined && req.query.start_date != "") {
            sql += " AND split_part(service_avail, ',', 1) <=";
            sql += ("'" + req.query.start_date + "'");
            sql += " AND split_part(service_avail, ',', 2) >=";
            sql += ("'" + req.query.start_date + "'");
        }
        if (req.query.end_date != undefined && req.query.end_date != "") {
            sql += " AND split_part(service_avail, ',', 1) <=";
            sql += ("'" + req.query.end_date + "'");
            sql += " AND split_part(service_avail, ',', 2) >=";
            sql += ("'" + req.query.end_date + "'");
        }
        if (req.query.form != undefined && req.query.form != "") {
            sql += " AND LOWER(full_name) LIKE LOWER(";
            sql += "'%" + req.query.form + "%')";
        }

        const filteredSearches = await pool.query(sql);
        if (filteredSearches !== undefined) res.json(filteredSearches.rows);
    } catch (error) {
        console.log(error.message);
    }
});


//indicate availabilities for parttime care takers
app.post("/setavail", async (req, res) => {
    try {
        //step 1: destructure req.body to get details
        const { service_avail_from, service_avail_to, employment_type, daily_price, pet_type } = req.body;

        // get user_email from jwt token
        const jwtToken = req.header("token")
        const user_email = jwt.verify(jwtToken, process.env.jwtSecret).user.email;
        // console.log(user_email)

        const newService = await pool.query(
            "INSERT INTO Offers_Services (caretaker_email, employment_type, service_avail_from, service_avail_to, type_pref, daily_price) \
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
            [user_email, employment_type, service_avail_from, service_avail_to, pet_type, daily_price]);

        res.json(newService.rows[0]);

    } catch (err) {
        console.error(err.message);
        res.status(500).send("A server error has been encountered");
    }
});

// //check working days for fulltime care takers
// app.get("/checkleave", async (req, res) => {
//     try {
//         const jwtToken = req.header("token")
//         const user_email = jwt.verify(jwtToken, process.env.jwtSecret).user.email;
//         const checkLeaves = await pool.query(`SELECT service_avail FROM Offers_services\
//                    WHERE caretaker_email = '${user_email}';`);
//         res.json(checkLeaves.rows);
//     } catch (err) {
//         console.error(err.message);
//     }
// });

//take leave for fulltime care takers
app.post("/takeleave", async (req, res) => {
    try {
        //step 1: destructure req.body to get details
        const { apply_leave_from, apply_leave_to } = req.body;

        // get user_email from jwt token
        const jwtToken = req.header("token")
        const user_email = jwt.verify(jwtToken, process.env.jwtSecret).user.email;
        // this will return in comma delimited format (start_date_1st avail, end_date_1st_avail, start_date_2ns_avail, end_date_2nd avail, leave period)
        const applyLeave = await pool.query("SELECT check_for_leave($1, $2, $3)",
            [user_email, apply_leave_from, apply_leave_to]);


        //make the old availability set to isavail = False

        //need to insert new availabilities into the the offers_services_table

        res.json(applyLeave.rows[0].check_for_leave);

    } catch (err) {
        console.error(err.message);
        res.status(406);
        res.json(err.message);
    }
    // //step 1: destructure req.body to get details
    // const { service_avail, employment_type } = req.body;

    // // get user_email from jwt token
    // const jwtToken = req.header("token")
    // const user_email = jwt.verify(jwtToken, process.env.jwtSecret).user.email;
    // console.log(user_email);

    // //If it is feasible to take leave and still have consecutive blocks of 2 x 150 days of work, execute update
    // if (count_2_150_days >= 2) {

    // } else {
    //     res.json("You cannot take leave during this period");
    //     //res.status(400).send("You cannot take leave during this period");
    // }
});

//petowner to submit bid for service
app.post("/submitbid", async (req, res) => {
    try {
        //step 1: destructure req.body to get details
        const { caretaker_email, employment_type, selected_petType, avail_from, avail_to,
            service_request_from, service_request_to, daily_price, transfer_mode,
            selected_pet, payment_mode } = req.body;

        // get user_email from jwt token
        const jwtToken = req.header("token")
        const owner_email = jwt.verify(jwtToken, process.env.jwtSecret).user.email;

        const newService = await pool.query(
            "INSERT INTO Transactions_Details (caretaker_email, employment_type, \
            pet_type, pet_name, owner_email, payment_mode, cost, mode_of_transfer, duration_from, \
            duration_to, service_avail_from, service_avail_to) \
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *",
            [caretaker_email, employment_type, selected_petType, selected_pet, owner_email, payment_mode,
                daily_price, transfer_mode, service_request_from, service_request_to, parseDate(avail_from),
                parseDate(avail_to)]);

        res.json(newService.rows[0]);

    } catch (err) {
        console.error(err.message);
        res.status(406);
        res.json(err.message);
    }
});

//caretaker to change bid status to ACCEPTED, REJECTED OR COMPLETED
app.put("/changebid", async (req, res) => {
    try {
        //step 1: destructure req.body to get details
        const { owner_email, pet_name, duration_to, duration_from, status_update } = req.body;

        // get user_email from jwt token
        const jwtToken = req.header("token")
        const caretaker_email = jwt.verify(jwtToken, process.env.jwtSecret).user.email;

        const txn = await pool.query(
            "UPDATE Transactions_Details SET t_status = $1 \
            WHERE (owner_email = $2 AND caretaker_email = $3 AND pet_name = $4 \
            AND duration_from = $5 AND duration_to = $6) RETURNING *" ,
            [status_update, owner_email, caretaker_email, pet_name, parseDate(duration_from), parseDate(duration_to)]);
        // console.log(req.body)
        res.json(txn.rows[0]);

    } catch (err) {
        console.error(err.message);
        res.status(406);
        res.json(err.message)
    }
});

//petowner to submit review for service
app.put("/submitreview", async (req, res) => {
    try {
        //step 1: destructure req.body to get details
        const { caretaker_email, employment_type, pet_name, duration_to, duration_from, rating, review } = req.body;

        // get user_email from jwt token
        const jwtToken = req.header("token")
        const owner_email = jwt.verify(jwtToken, process.env.jwtSecret).user.email;
        // console.log(owner_email)

        const txn = await pool.query(
            "UPDATE Transactions_Details SET owner_rating = $1, owner_review = $2, t_status = 5\
            WHERE (owner_email = $3 AND caretaker_email = $4 AND pet_name = $5 AND duration_from = $6 AND duration_to = $7) RETURNING *" ,
            [rating, review, owner_email, caretaker_email, pet_name, parseDate(duration_from), parseDate(duration_to)]);

        res.json(txn.rows[0]);

    } catch (err) {
        console.error(err.message);
        res.status(500).send("A server error has been encountered");
    }
});

//get all reviews of a caretaker
app.get("/getreview", async (req, res) => {
    try {
        let caretaker_email
        // if the caretaker_email contains the token (only from the homepage of caretaker)
        // a little janky 
        if (req.query.caretaker_email.indexOf("@") === -1) {
            let jwtToken = req.query.caretaker_email
            caretaker_email = jwt.verify(jwtToken, process.env.jwtSecret).user.email;
        } else {
            caretaker_email = req.query.caretaker_email
        }

        const searches = await pool.query(`SELECT Users.full_name, owner_review, owner_rating, t_status FROM Transactions_Details \
                                           LEFT JOIN Users ON Transactions_Details.owner_email = Users.email \ 
                                           WHERE caretaker_email ='${caretaker_email}' AND  t_status = 5;`);
        // console.log(searches.rows)
        res.json(searches.rows);
    } catch (error) {
        console.log(error.message)
    }
});

app.listen(5000, () => {
    console.log('server has started at port 5000');
});