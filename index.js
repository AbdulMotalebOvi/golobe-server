const express = require('express')
const app = express()
const port = process.env.PORT || 5000
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const SSLCommerzPayment = require('sslcommerz-lts')
const store_id = process.env.SSL_ID
const store_passwd = process.env.SSL_KEY
const is_live = false
var jwt = require('jsonwebtoken');

app.use(cors())
app.use(express.json())

function verifyJwt(req, res, next) {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return req.status(401).send('unauthorized access')
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded
        next()
    })

}


const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.5urggkk.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {

        const usersCollection = client.db('Golobe_Travel_Agency').collection('userCollection')
        const placesCollection = client.db('Golobe_Travel_Agency').collection('tour_places_sites')
        const bookingCollection = client.db('Golobe_Travel_Agency').collection('bookingCollection')
        const payments = client.db('Golobe_Travel_Agency').collection('paymentsCollection')
        const reviews = client.db('Golobe_Travel_Agency').collection('reviewCollection')
        // places get

        app.get('/placeName', async (req, res) => {
            const placed = req.query.place
            const query = { place: { $regex: placed, $options: 'i' } };
            const options = { sort: { place: 1 } };
            const result = await placesCollection.find(query, options).toArray()
            res.send(result)
        })
        app.get('/places', async (req, res) => {
            const query = {}
            const result = await placesCollection.find(query).toArray()
            res.send(result)
        })
        app.post('/places', async (req, res) => {
            const query = req.body
            const result = await placesCollection.insertOne(query)
            res.send(result)
        })
        app.get('/places/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await placesCollection.findOne(query)
            res.send(result)
        })

        // create user {signUp}
        app.post('/users', async (req, res) => {
            const user = req.body
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })
        app.get('/users', async (req, res) => {
            const query = {}
            const result = await usersCollection.find(query).toArray()
            res.send(result)
        })
        // bookings
        app.post('/mybookings', async (req, res) => {
            const booking = req.body
            const query = {
                email: booking.email,
                place: booking.place,
            }
            const alreadyBooked = await bookingCollection.find(query).toArray()
            if (alreadyBooked.length) {
                const message = `You Already Have a Booked on ${booking.place}`
                return res.send({ acknowledged: false, message })
            }
            const result = await bookingCollection.insertOne(booking)
            res.send(result)
        })
        app.get('/mybookings', async (req, res) => {
            const email = req.query.email
            const query = { email: email }
            const result = await bookingCollection.find(query).toArray()
            res.send(result)
        })

        app.post('/payment', async (req, res) => {
            const order = req.body
            const query = { _id: new ObjectId(order.service) }
            const result = await bookingCollection.findOne(query)

            const transactionId = new ObjectId().toString()
            const data = {
                total_amount: result.total,
                currency: 'BDT',
                tran_id: transactionId, // use unique tran_id for each api call
                success_url: `http://localhost:5000/payment/success?transactionId=${transactionId}`,
                fail_url: `http://localhost:5000/payment/fail?transactionId=${transactionId}`,
                cancel_url: 'http://localhost:3030/cancel',
                ipn_url: 'http://localhost:3030/ipn',
                product_name: result.place,
                product_category: 'Electronic',
                cus_name: result.customerName,
                cus_email: result.email,
                shipping_method: 'No',
                cus_phone: result.phone,
                ship_name: result.customerName,

                shipping_method: 'Courier',

                product_category: 'Electronic',
                product_profile: 'general',

                cus_add1: 'Dhaka',
                cus_add2: 'Dhaka',
                cus_city: 'Dhaka',
                cus_state: 'Dhaka',
                cus_postcode: '1000',
                cus_country: 'Bangladesh',

                cus_fax: result.phone,

                ship_add1: 'Dhaka',
                ship_add2: 'Dhaka',
                ship_city: 'Dhaka',
                ship_state: 'Dhaka',
                ship_postcode: 1000,
                ship_country: 'Bangladesh',
            };

            const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live)
            sslcz.init(data).then(apiResponse => {
                // Redirect the user to payment gateway

                let GatewayPageURL = apiResponse.GatewayPageURL
                bookingCollection.insertOne({
                    ...order,
                    price: result.total,
                    transactionId,
                    paid: false,
                })
                res.send({ url: GatewayPageURL })
            });


        })
        // success url
        app.post('/payment/success', async (req, res) => {
            try {
                const { transactionId } = req.query;

                const result = await bookingCollection.updateOne(
                    { transactionId },
                    {
                        $set: {
                            paid: true,
                            paidAt: new Date(),
                        },
                    }
                );

                if (result.modifiedCount > 0) {
                    return res.redirect(`http://localhost:3000/GolobeSecurity/payment/success?transactionId=${transactionId}`);
                }
                return res.status(400).send({ message: 'Update operation failed' });
            } catch (error) {
                console.error(error);
                return res.status(500).send({ message: 'Something went wrong' });
            }
        })
        // fail url
        app.post('/payment/fail', async (req, res) => {
            try {
                const { transactionId } = req.query;
                const result = await payments.deleteOne(
                    { transactionId }
                );

                if (result.deletedCount) {
                    return res.redirect('http://localhost:3000/GolobeSecurity/payment/fail')
                }
                return res.status(400).send({ message: 'Delete operation failed' });
            } catch (error) {
                console.error(error);
                return res.status(500).send({ message: 'Something went wrong' });
            }
        })
        app.get('/order/transactionHistory/:id', async (req, res) => {
            const id = req.params.id
            const query = { transactionId: id }
            const result = await bookingCollection.findOne(query)
            res.send(result)
        })
        // admin role
        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email
            const query = { email }
            const user = await usersCollection.findOne(query)
            res.send({ isAdmin: user?.role === 'admin' });
        })

        app.put('/users/admin/:id', verifyJwt, async (req, res) => {
            const email = req.decoded.email
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, options)
            res.send(result)
        })


        app.delete('/delete/user/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await usersCollection.deleteOne(query)
            res.send(result)
        })
        app.delete('/delete/place/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await placesCollection.deleteOne(query)
            res.send(result)
        })
        // JWT TOKEN
        app.get('/jwt', async (req, res) => {
            const email = req.query.email
            // console.log(email)
            const query = { email: email }

            const user = await usersCollection.findOne(query)
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1hr' })
                return res.send({ accessToken: token })
            }
            res.status(403).send({ accessToken: '' })

        })
        // delete
        app.delete('/bookings/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await bookingCollection.deleteOne(query)
            res.send(result)
        })

        // comment part
        app.post('/comment', async (req, res) => {
            const com = req.body
            const query = {
                email: com.email,
                place: com.place,
            }
            const alreadyBooked = await reviews.find(query).toArray()
            if (alreadyBooked.length) {
                const message = `You Already Feedback on ${com.place}`
                return res.send({ acknowledged: false, message })
            }
            const result = await reviews.insertOne(com)
            res.send(result)
        })


        app.get('/mycomment/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await reviews.findOne(query)
            if (!result) {
                return res.status(404).send('Data not found')
            }
            res.send(result)
        })
        app.get('/mycomment', async (req, res) => {
            const email = req.query.email
            const query = { email: email }
            const result = await reviews.find(query).toArray()
            if (!result) {
                return res.status(404).send('Data not found')
            }
            res.send(result)
        })

    }
    finally {

    }
}
run().catch(console.log())




app.get('/', (req, res) => {
    res.send('Golobe Server Is running')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})