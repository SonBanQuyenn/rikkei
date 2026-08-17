const generateLinks = (orderId, userId, status) => {
    const links = {
        self: {
            href: `/api/v2/orders/${orderId}`,
            method: 'GET'
        },
        customer: {
            href: `/api/v2/users/${userId}`,
            method: 'GET'
        }
    };

    if (status === 'pending') {
        links.cancel = {
            href: `/api/v2/orders/${orderId}/cancellation`,
            method: 'POST'
        };
    }

    return links;
};

module.exports = generateLinks;