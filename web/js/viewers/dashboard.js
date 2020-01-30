/*    
 * Copyright (C) 2020, Twinkle Labs, LLC.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

function createChartStorageStat(ctx, refSize, tmpSize, auxSize) {
    var config = {
	type: 'doughnut',
	data: {
	    datasets: [{
		data: [
                    refSize,
                    auxSize,
                    tmpSize
		],
		backgroundColor: [
                    '#00ff00',
                    '#ffff00',
                    '#ff0000'
		],
		label: 'Dataset 1'
	    }],
	    labels: [
		'BLOB',
		'AUX',
                'TMP'
	    ]
	},
	options: {
	    responsive: true,
	    legend: {
		position: 'top',
	    },
	    title: {
		display: true,
		text: 'Storage Stat'
	    },
	    animation: {
		animateScale: true,
		animateRotate: true
	    },
            tooltips: {
                callbacks: {
                    label: function(tooltipItem, data) {
                        var d = data.datasets[tooltipItem.datasetIndex].data[tooltipItem.index];
                        return humanFileSize(d);
                    }
                }
            }
	}
    };
    return new Chart(ctx, config);
}

function createChartBlobActivity(ctx, type, title, labels, data)
{
    var options = {};
    if (type == 'size') {
        options = {
            tooltips: {
                callbacks: {
                    label: function(tooltipItem, data) {
                        var d = data.datasets[tooltipItem.datasetIndex].data[tooltipItem.index];
                        return humanFileSize(d);
                    }
                }
            }
        };
    }
    return new Chart(ctx, {
        // The type of chart we want to create
        type: 'bar',

        // The data for our dataset
        data: {
            labels: labels,
            datasets: [{
                label: title,
                backgroundColor: 'rgb(255, 99, 132)',
                borderColor: 'rgb(255, 99, 132)',
                data: data
            }]
        },
        options: options
    });
}

registerViewer('dashboard', {
    load: function() {
        const v = this;
        const vc = cloneTemplate('tpl-dashboard');
        var ctx = vc.find('#chart1').getContext('2d');

        v.space.mux.request('space', [
            'stat'
        ], function(u) {
            var totalDbSize = u[0];
            var totalBlobSize = u[1].blobsize;
            var tempBlobSize = u[3].tempblobsize || 0;
            if (tempBlobSize > 0) {
                vc.find('#rmtmp').classList.remove('collapse'); 
            }
            createChartStorageStat(ctx, totalBlobSize-tempBlobSize, tempBlobSize, totalDbSize - totalBlobSize);
        });

        var activityChart = null;

        function loadRecentActivity() {
            var range = vc.find('#range').value;
            var selType = vc.find('#type');
            var type = selType.value;
            var typeText = selType.options[selType.selectedIndex].text;
            var req = ['list-blobs-stat'];
            var labels = [];
            for (var i = 14; i >= 0; i--) {
                var t;
                if (range == '15d') {
                    t = moment().subtract(i, 'days').startOf('day');
                    labels.push(t.format('MM-DD'));        
                } else if (range == '15m') {
                    t = moment().subtract(i, 'months').startOf('month');
                    labels.push(t.format('YYYY-MM'));
                } else if (range == '15y') {
                    t = moment().subtract(i, 'years').startOf('year');
                    labels.push(t.format('YYYY'));
                } else if (range == '75y') {
                    t = moment().subtract(i*5, 'years').startOf('year');
                    labels.push(t.format('YYYY'));
                }
                req.push(t.unix());
            }
            v.space.mux.request('space', req, function(x) {
                console.log(x);
                if (activityChart)
                    activityChart.destroy();
                var ctx = vc.find('#chart2').getContext('2d');
                if (type == 'cnt') {
                    activityChart = createChartBlobActivity(
                        ctx, type, typeText, labels,
                        x.map(function(y){ return y.blobcnt })
                    );
                } else {
                    activityChart = createChartBlobActivity(
                        ctx, type, typeText, labels,
                        x.map(function(y){ return y.blobsize })
                    );
                }
            });
        }

        vc.find('#rmtmp').onclick = function() {
            v.space.mux.request('space', [
                'remove-unref-blobs'
            ], function(x) {
                v.reload();
            });
        };

        vc.find('#range').onchange = loadRecentActivity;
        vc.find('#type').onchange = loadRecentActivity;

        loadRecentActivity();
        return vc;
    }
});
